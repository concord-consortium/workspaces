import * as React from 'react';
import * as ReactFauxDOM from 'react-faux-dom';
import * as d3 from 'd3';
import sizeMe from 'react-sizeme';
import { IAttribute, IValueType } from '../data-manager/attribute';
import { ICase, IDataSet, IDerivationSpec } from '../data-manager/data-manager';
import { Menu, MenuItem, Popover, Position } from '@blueprintjs/core';
import { assign, find, map, uniq } from 'lodash';
import './graph.css';

interface ISizeMeSize {
    width: number|null;
    height: number|null;
}

interface IGraphProps {
    size: ISizeMeSize;
    dataSet: IDataSet;
}

interface IGraphData {
    dataSet?: IDataSet;
    xAttrID?: string;
    yAttrID?: string;
    legendAttrID?: string;
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

interface ILegendNumericRange {
    min: number;
    max: number;
}
interface ILegendAttrType {
    isNumeric: boolean;
    min: number;
    max: number;
    ranges: ILegendNumericRange[];
    values: IValueType[];
}

export class GraphComponent extends React.Component<IGraphProps, IGraphState> {

    srcAttributesChanged: boolean = false;
    srcValuesChanged: boolean = false;
    legend: HTMLDivElement|null = null;

    constructor(props: IGraphProps) {
        super(props);

        this.state = assign(this.createGraphData(props.dataSet), {
                                xMenuIsOpen: false,
                                yMenuIsOpen: false,
                                graphMenuIsOpen: false,
                                legendMenuIsOpen: false,
                                legendHeight: 0
                            });

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
                return ((nonEmptyCount > 0) && (numericCount / nonEmptyCount >= 0.5));
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
        let numericCount = 0;
        let min = 0;
        let max = 0;
        legendAttr.values.forEach((value: string|number|undefined) => {
            if ((value != null) && (value !== '')) {
                ++nonEmptyCount;
                const numberValue = Number(value);
                if (isFinite(numberValue)) {
                    if (numericCount === 0) {
                        min = max = numberValue;
                    }
                    else {
                        min = Math.min(min, numberValue);
                        max = Math.max(max, numberValue);
                    }
                    ++numericCount;
                }
            }
        });
        const isNumeric = (nonEmptyCount > 0) && ((numericCount / nonEmptyCount) >= 0.5);
        const ranges: ILegendNumericRange[] = [];
        const values: IValueType[] = [];
        if (isNumeric) {
            const numRanges = Math.min(5, (max - min) + 1);
            const rangeSize = (max - min) / numRanges;
            for (let i = 0; i < numRanges; i++) {
                const rangeMin = min + (i * rangeSize);
                ranges.push({
                    min: rangeMin,
                    max: Math.min(max, rangeMin + rangeSize)
                });
                values.push(i);
            }
        }
        return {isNumeric, min, max, ranges, values};
    }

    createGraphData(srcDataSet?: IDataSet, attrs?: IGraphData): IGraphData {
        if (!srcDataSet) { return {}; }

        // client-specified attributes override state attributes
        const graphData = assign({}, this.state ? this.state : {} as IGraphData, attrs);
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

        const isEmpty = (value: string|number|undefined) => (value == null) || (value === '');
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

    attachHandlers(srcData?: IDataSet, graphData?: IDataSet) {
        const graphAttributeCount = graphData && graphData.attributes.length,
              graphDataIncomplete = !graphAttributeCount || (graphAttributeCount < 2);
        if (srcData) {
            srcData.addActionListener('graphSrc', (action) => {
                switch (action.name) {
                case 'addAttributeWithID':
                    if (srcData.isInTransaction) {
                        this.srcAttributesChanged = true;
                    }
                    else if (graphDataIncomplete) {
                        this.setState(this.createGraphData(srcData));
                    }
                    break;
                case 'setCaseValues':
                case 'setCanonicalCaseValues':
                    if (srcData.isInTransaction) {
                        this.srcValuesChanged = true;
                    }
                    else if (graphDataIncomplete) {
                        this.setState(this.createGraphData(srcData));
                    }
                    break;
                case 'endTransaction':
                    if (!srcData.isInTransaction) {
                        if (graphDataIncomplete &&
                            (this.srcAttributesChanged || this.srcValuesChanged)) {
                                this.setState(this.createGraphData(srcData));
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

    handleSelectAttribute = (evt: React.MouseEvent<HTMLElement>) => {
        const elt: HTMLElement = evt.target as HTMLElement,
              classes = elt.className,
              axisMatch = /data-axis-(x|y|legend)/.exec(classes),
              axis = axisMatch && axisMatch[1],
              idMatch = /data-id-([-\w]*)/.exec(classes),
              attrID = idMatch && idMatch[1];
        if (axis && attrID) {
            let attrs: IGraphData = {};
            switch (axis) {
                case 'x':
                    attrs.xAttrID = attrID;
                    break;
                case 'y':
                    attrs.yAttrID = attrID;
                    break;
                case 'legend':
                default:
                    attrs.legendAttrID = attrID;
                    break;
            }
            this.setState(this.createGraphData(this.props.dataSet, attrs));
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

    handleBackgroundClicked = () => {
        this.setState({ graphMenuIsOpen: !this.state.graphMenuIsOpen });
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

    getCategoricalLegendColor(index: number) {
        // from CODAP apps/dg/utilities/color_utilities.js#L61
        const colors = [
                '#FFB300', '#803E75', '#FF6800', '#A6BDD7', '#C10020', '#CEA262', '#817066', '#007D34',
                '#00538A', '#F13A13', '#53377A', '#FF8E00', '#B32851', '#F4C800', '#7F180D', '#93AA00', '#593315',
                '#232C16', '#FF7A5C', '#F6768E'
            ];
        return colors[index % colors.length];
    }

    renderCategoricalLegend(legendValues: IValueType[]) {
        const legends = legendValues.map((value, index) => {
            const style = {backgroundColor: this.getCategoricalLegendColor(index)};
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
                {this.renderLegendPopover()}
            </div>
        );
    }

    renderNumericLegend(legendAttrType: ILegendAttrType, legendValues: IValueType[]) {
        const rangePercentageWidth = 100 / legendAttrType.ranges.length;

        const rangeElements = legendValues.map((value, index) => {
            const style = {
                minWidth: `${rangePercentageWidth}%`,
                backgroundColor: this.getCategoricalLegendColor(index)
            };
            const range = legendAttrType.ranges[index];
            const title = `${range.min} - ${range.max}`;
            return (
                <div className="legend-numeric-range" key={`range-${index}`} style={style} title={title} />
            );
        });

        return (
            <div onClick={() => this.setState({legendMenuIsOpen: !this.state.legendMenuIsOpen})}>
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
        return (
            <div className="legend" ref={(legend) => this.legend = legend}>
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
                .domain([xMin, xMax || 1]).nice(),

            y = d3.scaleLinear()
                .range([height, 0])
                .domain([yMin, yMax || 1]).nice(),

            coordinates: IGraphCoordinate[][] = [],

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
            const range = legendAttrType && isNumeric ? legendAttrType.ranges[index] : undefined;
            xValues.forEach((iX: number, i: number) => {
                let addPoint = false;
                if (range) {
                    const legendValue = legendValues[i];
                    addPoint = (legendValue !== undefined) &&
                               (legendValue >= range.min ) &&
                               (legendValue <= range.max);
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

        svg.append('rect')
            .attr('class', 'background')
            .attr('width', '100%')
            .attr('height', '100%')
            .on('click', () => this.handleBackgroundClicked());

        svg.append('g')
            .attr('class', 'x axis')
            .attr('transform', 'translate(0,' + height + ')')
            .call(xAxis)
            .append('text')
            .attr('transform', 'translate(' + (width / 2) + ',' + (margin.bottom - 3) + ')')
            .style('text-anchor', 'middle')
            .text(xAttr ? xAttr.name : '')
            .on('click', () => this.setState({ xMenuIsOpen: true }));

        svg.append('g')
            .attr('class', 'y axis')
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
            .attr('fill', this.getCategoricalLegendColor(index))
            .attr('r', kPointRadius)
            .attr('className', 'nc-point');
        });

        // const {divWidth, divHeight} = this.props.size;
        return (
            <div className="neo-codap-graph">
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