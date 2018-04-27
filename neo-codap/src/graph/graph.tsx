import * as React from 'react';
import * as ReactFauxDOM from 'react-faux-dom';
import * as d3 from 'd3';
import sizeMe from 'react-sizeme';
import { IAttribute, IValueType } from '../data-manager/attribute';
import { ICase, IDataSet, IDerivationSpec } from '../data-manager/data-manager';
import { Menu, MenuItem, Popover, Position } from '@blueprintjs/core';
import { assign, find, map, uniq, range } from 'lodash';
import './graph.css';
import { getSnapshot, onSnapshot, types } from 'mobx-state-tree';

// NOTE: the attribute names in this model should also exist in IGraphData
//       as objects of both types are merged when calling createGraphData()
export const GraphComponentData = types.model('GraphComponentData',
  {
    xAttrID: types.maybe(types.string),
    yAttrID: types.maybe(types.string),
    legendAttrID: types.maybe(types.string)
  })
  .actions(self => ({
    setXAttrID(xAttrID: string|null) {
      self.xAttrID = xAttrID;
    },
    setYAttrID(yAttrID: string|null) {
      self.yAttrID = yAttrID;
    },
    setLegendAttrID(legendAttrID: string|null) {
      self.legendAttrID = legendAttrID;
    },
  }));
export type IGraphComponentData = typeof GraphComponentData.Type;

interface ISizeMeSize {
    width: number|null;
    height: number|null;
}

interface IGraphProps {
    size: ISizeMeSize;
    dataSet: IDataSet;
    graphComponentData?: IGraphComponentData|null;
}

interface IGraphData {
    dataSet?: IDataSet;
    xAttrID?: string|null;
    yAttrID?: string|null;
    legendAttrID?: string|null;
    legendAttrType?: ILegendAttrType;
}

interface IGraphState extends IGraphData {
    xMenuIsOpen: boolean;
    yMenuIsOpen: boolean;
    graphMenuIsOpen: boolean;
    legendMenuIsOpen: boolean;
    legendHeight: number;
}

interface IAttributeLegendScore {
    id: string;
    score: number;
    index: number;
}

interface IAttributeUniqueValueMap {
    [key: string]: boolean;
}

interface IGraphCoordinate {
    x: number;
    y: number;
}

interface ILegendQuantile {
    min: number;
    max: number;
}
interface ILegendAttrType {
    isNumeric: boolean;
    min: number;
    max: number;
    quantiles: ILegendQuantile[];
    values: IValueType[];
}

export class GraphComponent extends React.Component<IGraphProps, IGraphState> {

    srcAttributesChanged: boolean = false;
    srcValuesChanged: boolean = false;
    legend: HTMLDivElement|null = null;
    idleTimer: number | null = null;

    constructor(props: IGraphProps) {
        super(props);

        this.state = assign(this.createGraphData(props.dataSet), {
                                xMenuIsOpen: false,
                                yMenuIsOpen: false,
                                graphMenuIsOpen: false,
                                legendMenuIsOpen: false,
                                legendHeight: 0
                            });

        const {graphComponentData} = this.props;
        if (graphComponentData) {
            onSnapshot(graphComponentData, (snapshot: IGraphComponentData) => {
                this.setState(this.createGraphData(this.props.dataSet, snapshot));
            });
        }

        this.attachHandlers(this.props.dataSet);
    }

    findPlottableAttribute(srcDataSet: IDataSet, afterAttrID?: string) {
        const afterAttrIndex = afterAttrID ? srcDataSet.attrIndexFromID(afterAttrID) : undefined,
              found = find(srcDataSet.attributes, (attr) => {
                let numericCount = 0,
                    nonEmptyCount = 0;
                attr.values.forEach((value) => {
                    if ((value != null) && (value !== '')) {
                        ++nonEmptyCount;
                        if (isFinite(Number(value))) {
                            ++numericCount;
                        }
                    }
                });
                // attribute is plottable if at least half of its non-empty values are numeric
                return ((nonEmptyCount > 0) && (numericCount > 0) && (numericCount / nonEmptyCount >= 0.5));
              }, afterAttrIndex != null ? afterAttrIndex + 1 : undefined);
        return found ? (found as {} as IAttribute).id : undefined;
    }

    findLegendAttribute(srcDataSet: IDataSet) {
        const scores: IAttributeLegendScore[] = map(srcDataSet.attributes, (attr: IAttribute, index) => {
            const uniqueValues: IAttributeUniqueValueMap = {};
            let nonNumericCount = 0,
                nonEmptyCount = 0;
            attr.values.forEach((value: string|number|undefined) => {
                if ((value != null) && (value !== '')) {
                    ++nonEmptyCount;
                    if (!isFinite(Number(value))) {
                        ++nonNumericCount;
                        uniqueValues[value] = true;
                    }
                }
            });

            // attribute score is based on the ratio of non-numeric values to non-empty values
            // with a boost based on the inverse of the number of unique values
            // (so that attributes with fewer unique values score higher)
            let score = nonEmptyCount > 0 ? nonNumericCount / nonEmptyCount : 0;
            const numUniqueValues = Object.keys(uniqueValues).length;
            score += numUniqueValues > 0 ? (1 / numUniqueValues) : 0;

            return {id: attr.id, score, index};
        });
        if (scores.length > 0) {
            scores.sort((a, b) => {
                // in case of a tying score pick the left most one
                if (a.score === b.score) {
                    return a.index - b.index;
                }
                // otherwise, sort by descending score
                return b.score - a.score;
            });
            const highestScore = scores[0];
            return highestScore.score > 0 ? highestScore.id : undefined;
        }
        return undefined;
    }

    getLegendAttrType(srcDataSet: IDataSet, legendAttr: IAttribute) {

        let nonEmptyCount = 0;
        let min = 0;
        let max = 0;
        const numericValues: number[] = [];

        legendAttr.values.forEach((value: IValueType) => {
            if ((value !== undefined) && (value !== null) && (value !== '')) {
                nonEmptyCount++;
                const numericValue = Number(value);
                if (isFinite(numericValue)) {
                    if (numericValues.length === 0) {
                        min = max = numericValue;
                    }
                    else {
                        min = Math.min(min, numericValue);
                        max = Math.max(max, numericValue);
                    }
                    numericValues.push(numericValue);
                }
            }
        });

        const isNumeric = (nonEmptyCount > 0) &&
                          (numericValues.length > 0) &&
                          ((numericValues.length / nonEmptyCount) >= 0.5);
        const quantiles: ILegendQuantile[] = [];
        const values: IValueType[] = [];

        if (isNumeric) {
            numericValues.sort((a, b) => a - b);
            const numQuantiles = Math.min(5, numericValues.length);
            const lastIndex = numericValues.length - 1;

            // adapted from CODAP's DG.MathUtilities.nQuantileValues()
            for (let quantileIndex = 0; quantileIndex < numQuantiles; quantileIndex++) {
                let numericIndex = lastIndex * (quantileIndex / numQuantiles),
                    numericIndexFloor = Math.floor(numericIndex),
                    numericIndexCeil = Math.ceil(numericIndex),
                    fraction = numericIndex - numericIndexFloor,
                    quantileMin;

                if (numericIndex >= lastIndex) {
                    quantileMin = numericValues[lastIndex];
                } else if (numericIndex === numericIndexFloor) {
                    quantileMin = numericValues[numericIndexFloor];
                } else {
                    quantileMin = (numericValues[numericIndexCeil] * fraction) +
                                  (numericValues[numericIndexFloor] * (1.0 - fraction));
                }

                quantiles.push({min: quantileMin, max: max});
                if (quantileIndex > 0) {
                    quantiles[quantileIndex - 1].max = quantileMin;
                }
                values.push(quantileIndex);
            }
        }
        return {isNumeric, min, max, quantiles, values};
    }

    createGraphData(srcDataSet?: IDataSet, attrs?: IGraphData): IGraphData {
        if (!srcDataSet) { return {}; }

        // client-specified attributes override state attributes
        const {graphComponentData} = this.props;
        const componentData: IGraphData = graphComponentData ? getSnapshot(graphComponentData) : {};
        const stateData = this.state ? this.state : {} as IGraphData;
        const graphData = assign({}, componentData, stateData, attrs);
        let { xAttrID, yAttrID, legendAttrID, legendAttrType } = graphData,
            xAttr: IAttribute, yAttr: IAttribute, legendAttr: IAttribute,
            attrIDs: string[] = [];
        if (!xAttrID) {
            xAttrID = this.findPlottableAttribute(srcDataSet);
        }
        if (xAttrID) {
            attrIDs.push(xAttrID);
            xAttr = srcDataSet.attrFromID(xAttrID);
        }
        if (!yAttrID) {
            yAttrID = this.findPlottableAttribute(srcDataSet, xAttrID);
        }
        if (yAttrID) {
            attrIDs.push(yAttrID);
            yAttr = srcDataSet.attrFromID(yAttrID);
        }
        if (!legendAttrID) {
            legendAttrID = this.findLegendAttribute(srcDataSet);
        }
        if (legendAttrID && (legendAttrID !== 'none')) {
            attrIDs.push(legendAttrID);
            legendAttr = srcDataSet.attrFromID(legendAttrID);
            legendAttrType = this.getLegendAttrType(srcDataSet, legendAttr);
        }

        const isEmpty = (value: IValueType) => (value == null) || (value === '');
        const derivationSpec: IDerivationSpec = {
                attributeIDs: attrIDs,
                filter: (aCase: ICase) => {
                    let x = aCase[xAttr ? xAttr.name : ''],
                        y = aCase[yAttr ? yAttr.name : ''],
                        legend = legendAttr ? aCase[legendAttr.name] : '';
                    // exclude missing values
                    if (isEmpty(x) || isEmpty(y) || (legendAttr && isEmpty(legend))) {
                        return undefined;
                    }
                    // convert to numeric
                    x = Number(x);
                    y = Number(y);
                    // exclude NaNs & infinities
                    if (!isFinite(x) || !isFinite(y)) {
                        return undefined;
                    }
                    // return the filtered case
                    aCase[xAttr ? xAttr.name : ''] = x;
                    aCase[yAttr ? yAttr.name : ''] = y;
                    aCase[legendAttr ? legendAttr.name : ''] = legend;
                    return aCase;
                },
                synchronize: true
            },
            dataSet = srcDataSet && srcDataSet.derive('graphData', derivationSpec);

        this.attachHandlers(undefined, dataSet);
        return { dataSet, xAttrID, yAttrID, legendAttrID, legendAttrType };
    }

    // wait for asynchronous changes to quiet down before configuring graph
    createGraphDataWhenIdle(srcData?: IDataSet) {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }
        this.idleTimer = window.setTimeout(() => {
            this.setState(this.createGraphData(srcData));
            this.idleTimer = null;
        }, 100);
    }

    attachHandlers(srcData?: IDataSet, graphData?: IDataSet) {
        const graphAttributeCount = graphData && graphData.attributes.length,
              graphDataIncomplete = !graphAttributeCount || (graphAttributeCount < 2);
        if (srcData) {
            srcData.addActionListener('graphSrc', (action) => {
                switch (action.name) {
                case 'addAttributeWithID':
                case 'removeAttribute':
                    if (srcData.isInTransaction) {
                        this.srcAttributesChanged = true;
                    }
                    else if (graphDataIncomplete) {
                        this.createGraphDataWhenIdle(srcData);
                    }
                    break;
                case 'addCasesWithIDs':
                case 'addCanonicalCasesWithIDs':
                case 'setCaseValues':
                case 'setCanonicalCaseValues':
                    if (srcData.isInTransaction) {
                        this.srcValuesChanged = true;
                    }
                    else if (graphDataIncomplete) {
                        this.createGraphDataWhenIdle(srcData);
                    }
                    break;
                case 'endTransaction':
                    if (!srcData.isInTransaction) {
                        if (graphDataIncomplete &&
                            (this.srcAttributesChanged || this.srcValuesChanged)) {
                                this.createGraphDataWhenIdle(srcData);
                            }
                        this.srcAttributesChanged = false;
                        this.srcValuesChanged = false;
                    }
                    break;
                default:
                    break;
                }
            });
        }
        if (graphData) {
            graphData.addActionListener('graph', (action) => {
                this.forceUpdate();
            });
        }
    }

    detachHandlers(srcData?: IDataSet, graphData?: IDataSet) {
        if (srcData) {
            srcData.removeActionListener('graph');
        }
        if (graphData) {
            graphData.removeActionListener('graph');
        }
    }

    componentWillReceiveProps(nextProps: IGraphProps) {
        const { dataSet } = nextProps;
        if (dataSet !== this.props.dataSet) {
            this.detachHandlers(this.props.dataSet, this.state.dataSet);
            const newGraphData = this.createGraphData(dataSet);
            this.attachHandlers(dataSet, newGraphData.dataSet);
            this.setState(newGraphData);
        }
    }

    componentWillUnmount() {
        this.detachHandlers(this.props.dataSet, this.state.dataSet);
    }

    componentDidUpdate() {
        if (this.legend) {
            const { legendHeight } = this.state;
            const currentLegendHeight = this.legend.clientHeight;
            if (currentLegendHeight !== legendHeight) {
                this.setState({legendHeight: currentLegendHeight});
            }
        }
        else if (this.state.legendHeight > 0) {
            this.setState({legendHeight: 0});
        }
    }

    handleBackgroundClicked = () => {
        this.setState({ graphMenuIsOpen: !this.state.graphMenuIsOpen });
    }

    handleSelectAttribute = (evt: React.MouseEvent<HTMLElement>) => {
        const elt: HTMLElement = evt.target as HTMLElement,
              classes = elt.className,
              axisMatch = /data-axis-(x|y|legend)/.exec(classes),
              axis = axisMatch && axisMatch[1],
              idMatch = /data-id-([-\w]*)/.exec(classes),
              attrID = idMatch && idMatch[1];
        if (axis && attrID) {
            let attrs: IGraphData = {};
            const { graphComponentData } = this.props;
            switch (axis) {
                case 'x':
                    attrs.xAttrID = attrID;
                    if (graphComponentData) {
                        graphComponentData.setXAttrID(attrID);
                    }
                    break;
                case 'y':
                    attrs.yAttrID = attrID;
                    if (graphComponentData) {
                        graphComponentData.setYAttrID(attrID);
                    }
                    break;
                case 'legend':
                default:
                    attrs.legendAttrID = attrID;
                    if (graphComponentData) {
                        graphComponentData.setLegendAttrID(attrID);
                    }
                    break;
            }
            this.setState(this.createGraphData(this.props.dataSet, attrs));
        }
    }

    handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    }

    handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        try {
            const data = JSON.parse(e.dataTransfer.getData('text'));
            if (data) {
                if (data.type === 'drag-column-from-case-table') {
                    // TODO: handle drop from case table
                    alert('Dropped ' + data.name);
                }
            }
        }
        catch (e) {
            alert('Unable to parse dropped info');
        }
    }

    renderAttributeMenu(axisLabel: string, menuLabel: string, addNoneOption?: boolean) {
        const renderAttributeItems = () => {
            if (!this.props.dataSet) { return null; }
            const items: JSX.Element[] = this.props.dataSet.attributes.map((attr) => {
                return (
                    <MenuItem
                      className={`data-axis-${axisLabel} data-id-${attr.id}`}
                      text={attr.name}
                      key={attr.id}
                      onClick={this.handleSelectAttribute}
                    />
                );
            });
            if (addNoneOption) {
                items.unshift(
                    <MenuItem
                        className={`data-axis-${axisLabel} data-id-none`}
                        text="None"
                        key="none"
                        onClick={this.handleSelectAttribute}
                    />
                );
            }
            return items;
        };
        return (
            <div>
                <div className="attribute-menu-label">{menuLabel}</div>
                <Menu>
                    {renderAttributeItems()}
                </Menu>
            </div>
        );
    }

    renderXAxisPopover() {
        const handlePopoverInteraction = (nextOpenState: boolean) => {
            this.setState({ xMenuIsOpen: nextOpenState });
        };
        const style = {bottom: this.state.legendHeight};
        return (
            <div className="nc-popover-container nc-x-popover-container" style={style}>
                <Popover
                    popoverClassName="nc-popover-menu nc-x-popover-menu"
                    content={this.renderAttributeMenu('x', 'X Axis')}
                    position={Position.TOP}
                    isOpen={this.state.xMenuIsOpen}
                    onInteraction={handlePopoverInteraction}
                >
                    <div/>
                </Popover>
            </div>
        );
    }

    renderYAxisPopover() {
        const handlePopoverInteraction = (nextOpenState: boolean) => {
            this.setState({ yMenuIsOpen: nextOpenState });
        };
        return (
            <div className="nc-popover-container nc-y-popover-container">
                <Popover
                    popoverClassName="nc-popover-menu nc-y-popover-menu"
                    content={this.renderAttributeMenu('y', 'Y Axis')}
                    position={Position.RIGHT}
                    isOpen={this.state.yMenuIsOpen}
                    onInteraction={handlePopoverInteraction}
                >
                    <div/>
                </Popover>
            </div>
        );
    }

    renderGraphPopover() {
        const handlePopoverInteraction = (nextOpenState: boolean) => {
            this.setState({ graphMenuIsOpen: nextOpenState });
        };
        return (
            <div className="nc-popover-container nc-graph-popover-container">
                <Popover
                    popoverClassName="nc-popover-menu nc-graph-popover-menu"
                    content={this.renderAttributeMenu('legend', 'Legend', true)}
                    position={Position.LEFT}
                    isOpen={this.state.graphMenuIsOpen}
                    onInteraction={handlePopoverInteraction}
                    tetherOptions={{targetOffset: '0 50%'}}
                >
                    <div/>
                </Popover>
            </div>
        );
    }

    renderLegendPopover() {
        const handlePopoverInteraction = (nextOpenState: boolean) => {
            this.setState({ legendMenuIsOpen: nextOpenState });
        };
        return (
            <div className="nc-popover-container nc-legend-popover-container">
                <Popover
                    popoverClassName="nc-popover-menu nc-graph-popover-menu"
                    content={this.renderAttributeMenu('legend', 'Legend', true)}
                    position={Position.TOP}
                    isOpen={this.state.legendMenuIsOpen}
                    onInteraction={handlePopoverInteraction}
                >
                    <div/>
                </Popover>
            </div>
        );
    }

    getLegendColors() {
        // from CODAP apps/dg/utilities/color_utilities.js#L61
        return [
                '#FFB300', '#803E75', '#FF6800', '#A6BDD7', '#C10020', '#CEA262', '#817066', '#007D34',
                '#00538A', '#F13A13', '#53377A', '#FF8E00', '#B32851', '#F4C800', '#7F180D', '#93AA00', '#593315',
                '#232C16', '#FF7A5C', '#F6768E'
            ];
    }

    getNumericLegendColors(legendAttrType: ILegendAttrType) {
        const ranges = legendAttrType.quantiles;
        const numRanges = ranges.length;

        let numericColors = this.getLegendColors(); // as a fallback
        if (numRanges > 1) {
            const leftHSL  = {h: 40, s: 31, l: 85};
            const rightHSL = {h: 40, s: 100, l: 23};
            const lerp = (v0: number, v1: number, t: number) => v0 * (1 - t) + v1 * t;
            const lerpColor = (weight: number) => {
                const h = lerp(leftHSL.h, rightHSL.h, weight);
                const s = lerp(leftHSL.s, rightHSL.s, weight);
                const l = lerp(leftHSL.l, rightHSL.l, weight);
                return `hsl(${h},${s}%,${l}%)`;
            };
            numericColors = range(0, numRanges).map((value) => lerpColor(value / (numRanges - 1)));
        }

        return numericColors;
    }

    renderCategoricalLegend(legendValues: IValueType[]) {
        const colors = this.getLegendColors();
        const legends = legendValues.map((value, index) => {
            const style = {backgroundColor: colors[index % colors.length]};
            return (
                <div className="legend-item" key={`item-${index}`} >
                    <div className="legend-color" key={`color-${index}`} style={style} />
                    {value}
                </div>
            );
        });
        return (
            <div>
                {legends}
                {this.state.legendMenuIsOpen ? this.renderLegendPopover() : null}
            </div>
        );
    }

    renderTrailingDecimals(num: number) {
        return `${num.toFixed(2)}`.replace(/0+$/, '').replace(/\.+$/, '');
    }

    renderNumericLegend(legendAttrType: ILegendAttrType, legendValues: IValueType[]) {
        const ranges = legendAttrType.quantiles;
        const numRanges = ranges.length;
        const rangePercentageWidth = 100 / numRanges;
        const numericColors = this.getNumericLegendColors(legendAttrType);

        const rangeElements = legendValues.map((value, index) => {
            const style = {
                minWidth: `${rangePercentageWidth}%`,
                backgroundColor: numericColors[index % numericColors.length]
            };
            const legendRange = ranges[index];
            const min = this.renderTrailingDecimals(legendRange.min);
            const max = this.renderTrailingDecimals(legendRange.max);
            const title = `${min} - ${max}`;
            return (
                <div className="legend-numeric-range" key={`range-${index}`} style={style} title={title} />
            );
        });

        return (
            <div>
                <div className="legend-numeric">
                    <div className="legend-numeric-ranges">{rangeElements}</div>
                    <div className="legend-numeric-min">{legendAttrType.min}</div>
                    <div className="legend-numeric-max">{legendAttrType.max}</div>
                </div>
                {this.state.legendMenuIsOpen ? this.renderLegendPopover() : null}
            </div>
        );
    }

    renderLegend(legendAttr: IAttribute, legendAttrType: ILegendAttrType|undefined, legendValues: IValueType[]) {
        const isNumeric = legendAttrType && legendAttrType.isNumeric;
        const togglePopover = () => this.setState({legendMenuIsOpen: !this.state.legendMenuIsOpen});
        return (
            <div className="legend" ref={(legend) => this.legend = legend} onClick={togglePopover}>
                <div className="legend-title">{legendAttr.name}</div>
                {isNumeric && legendAttrType
                    ? this.renderNumericLegend(legendAttrType, legendValues)
                    : this.renderCategoricalLegend(legendValues)
                }
            </div>
        );
    }

    render() {
        if (!this.props.size.width || !this.props.size.height || !this.state.dataSet) {
            return null;
        }

        let { legendHeight } = this.state;
        const { dataSet, legendAttrID, legendAttrType } = this.state;
        const legendAttr: IAttribute|undefined = legendAttrID ? dataSet.attrFromID(legendAttrID) : undefined;
        const legendValues: IValueType[] = legendAttr ? legendAttr.values : [undefined];
        const isNumeric = legendAttrType && legendAttrType.isNumeric;
        const uniqueLegendValues = uniq(legendAttrType && isNumeric ? legendAttrType.values : legendValues);

        if (legendAttr && !legendHeight) {
            // render only the legend so we can calculate the height and re-render with the
            // svg height set to not overlap the legend
            return (
                <div className="neo-codap-graph">
                    {this.renderLegend(legendAttr, legendAttrType, uniqueLegendValues)}
                </div>
            );
        }

        const kPointRadius: number = 6;

        const
            { xAttrID, yAttrID } = this.state,
            graphCaseCount = dataSet && dataSet.cases.length;
        if (!dataSet) { return null; }
        let xAttr = dataSet.attrFromID(xAttrID || ''),
            yAttr = dataSet.attrFromID(yAttrID || '');
        let xValues: number[] = xAttr ? xAttr.values as number[] : [],
            yValues: number[] = yAttr ? yAttr.values as number[] : [];
        let xMin = graphCaseCount ? Math.min(0, d3.min(xValues) || 0) : 0,
            yMin = graphCaseCount ? Math.min(0, d3.min(yValues) || 0) : 0,
            xMax = graphCaseCount ? d3.max(xValues) : 10,
            yMax = graphCaseCount ? d3.max(yValues) : 10;

        xMax = xMax === undefined ? 0 : xMax;
        yMax = yMax === undefined ? 0 : (yMax < 0 ? 0 : yMax);

        // Just for fun plot a _lot_ of random points instead of the ones from dataset
/*
        let xRandFunc = d3.randomNormal(xMax && xMax / 2, xMax && xMax/6),
            yRandFunc = d3.randomNormal(yMax && yMax / 2, yMax && yMax/6);
        xValues = d3.range(1000).map(function () {
            return xRandFunc();
        }) as number[];
        yValues = d3.range(1000).map(function () {
            return yRandFunc();
        }) as number[];
*/

        let margin = {top: 20, right: 20, bottom: 35, left: 50},
            width: number = this.props.size.width - margin.left - margin.right,
            height: number = this.props.size.height - margin.top - margin.bottom - legendHeight,
            x = d3.scaleLinear()
                .range([0, width])
                .domain([xMin, xMax]).nice(),

            y = d3.scaleLinear()
                .range([height, 0])
                .domain([yMin, yMax]).nice(),

            coordinates: IGraphCoordinate[][] = [],
            colors = legendAttrType ? this.getNumericLegendColors(legendAttrType) : this.getLegendColors(),

            xAxis = d3.axisBottom(x),

            yAxis = d3.axisLeft(y),

            node = ReactFauxDOM.createElement('svg'),
            svg = d3.select(node)
                .attr('width', width + margin.left + margin.right)
                .attr('height', height + margin.top + margin.bottom)
                .append('g')
                .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

        uniqueLegendValues.forEach((uniqueLegendValue, index) => {
            const values: IGraphCoordinate[] = [];
            const legendRange = legendAttrType && isNumeric ? legendAttrType.quantiles[index] : undefined;
            xValues.forEach((iX: number, i: number) => {
                let addPoint = false;
                if (legendRange) {
                    const legendValue = legendValues[i];
                    addPoint = (legendValue !== undefined) &&
                               (legendValue >= legendRange.min ) &&
                               (legendValue <= legendRange.max);
                }
                else {
                    addPoint = uniqueLegendValue === legendValues[i];
                }
                if (addPoint) {
                    values.push({x: x(iX), y: y(yValues[i])});
                }
            });
            coordinates[index] = values;
        });

        const backgroundOffset = 2;
        svg.append('rect')
            .attr('class', 'background')
            .attr('width', width - backgroundOffset)
            .attr('height', height - backgroundOffset)
            .attr('fill', '#fff')
            .attr('transform', `translate(${backgroundOffset},-${backgroundOffset})`)
            .on('click', this.handleBackgroundClicked);

        svg.append('g')
            .attr('class', 'x axis')
            .attr('transform', 'translate(0,' + y(0)  + ')')
            .call(xAxis)
            .append('text')
            .attr('transform', 'translate(' + (width / 2) + ',' + (margin.bottom - 3) + ')')
            .style('text-anchor', 'middle')
            .text(xAttr ? xAttr.name : '')
            .on('click', () => this.setState({ xMenuIsOpen: true }));

        svg.append('g')
            .attr('class', 'y axis')
            .attr('transform', 'translate(' + x(0) + ',0)')
            .call(yAxis)
            .append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', -margin.left + 20)
            .attr('x', -height / 2)
            .style('text-anchor', 'middle')
            .text(yAttr ? yAttr.name : '')
            .on('click', () => this.setState({ yMenuIsOpen: true }));

        coordinates.forEach((coordArray, index) => {
            svg.selectAll('circle' + index)
            .data(coordArray)
            .enter().append('circle')
            .attr('cx', function (coords: { x: number, y: number }) {
                return coords.x;
            })
            .attr('cy', function (coords: { x: number, y: number }) {
                return coords.y;
            })
            .attr('fill', colors[index % colors.length])
            .attr('r', kPointRadius)
            .attr('className', 'nc-point');
        });

        // Note: the graph popover is conditionally rendered so that the SVG element can get all mouse
        // events for data point mouseovers and clicks.
        return (
            <div className="neo-codap-graph" onDragOver={this.handleDragOver} onDrop={this.handleDrop}>
                {node.toReact()}
                {this.renderXAxisPopover()}
                {this.renderYAxisPopover()}
                {this.state.graphMenuIsOpen ? this.renderGraphPopover() : null}
                {legendAttr ? this.renderLegend(legendAttr, legendAttrType, uniqueLegendValues) : null}
            </div>
        );
    }
}

const sizeMeConfig = {
    monitorWidth: true,
    monitorHeight: true
};

export const Graph = sizeMe(sizeMeConfig)(GraphComponent);