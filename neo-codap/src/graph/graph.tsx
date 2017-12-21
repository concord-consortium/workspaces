import * as React from 'react';
import * as ReactFauxDOM from 'react-faux-dom';
import * as d3 from 'd3';
import sizeMe from 'react-sizeme';
import { IAttribute } from '../data-manager/attribute';
import { ICase, IDataSet, IDerivationSpec } from '../data-manager/data-manager';
import { Menu, MenuItem, Popover, Position } from '@blueprintjs/core';
import { assign, find } from 'lodash';
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
}

interface IGraphState extends IGraphData {
    xMenuIsOpen: boolean;
    yMenuIsOpen: boolean;
}

export class GraphComponent extends React.Component<IGraphProps, IGraphState> {

    srcAttributesChanged: boolean = false;
    srcValuesChanged: boolean = false;

    constructor(props: IGraphProps) {
        super(props);

        this.state = assign({}, this.createGraphData(props.dataSet), {
                                xMenuIsOpen: false,
                                yMenuIsOpen: false
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

    createGraphData(srcDataSet?: IDataSet, attrs?: IGraphData): IGraphData {
        if (!srcDataSet) { return {}; }

        // client-specified attributes override state attributes
        const graphData = assign({}, this.state ? this.state : {} as IGraphData, attrs);
        let { xAttrID, yAttrID } = graphData,
            xAttr: IAttribute, yAttr: IAttribute,
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
    
        const derivationSpec: IDerivationSpec = {
                attributeIDs: attrIDs,
                filter: (aCase: ICase) => {
                    let x = aCase[xAttr ? xAttr.name : ''],
                        y = aCase[yAttr ? yAttr.name : ''];
                    // exclude missing values
                    if ((x == null) || (x === '') || (y == null) || (y === '')) {
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
                    return aCase;
                },
                synchronize: true
            },
            dataSet = srcDataSet && srcDataSet.derive('graphData', derivationSpec);

        this.attachHandlers(undefined, dataSet);
        return { dataSet, xAttrID, yAttrID };
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
              axisMatch = /data-axis-([xy])/.exec(classes),
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
                default:
                    attrs.yAttrID = attrID;
                    break;
            }
            this.setState(this.createGraphData(this.props.dataSet, attrs));
        }
    }

    renderAttributeMenu(axisLabel: string) {
        const renderAttributeItems = () => {
            if (!this.props.dataSet) { return null; }
            return this.props.dataSet.attributes.map((attr) => {
                return (
                    <MenuItem
                      className={`data-axis-${axisLabel} data-id-${attr.id}`}
                      text={attr.name}
                      key={attr.id}
                      onClick={this.handleSelectAttribute}
                    />
                );
            });
        };
        return (
            <Menu>
                {renderAttributeItems()}
            </Menu>
        );
    }

    renderXAxisPopover() {
        const handlePopoverInteraction = (nextOpenState: boolean) => {
            this.setState({ xMenuIsOpen: nextOpenState });
        };
        return (
            <div className="nc-popover-container nc-x-popover-container">
                <Popover
                    popoverClassName="nc-popover-menu nc-x-popover-menu"
                    content={this.renderAttributeMenu('x')}
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
                    content={this.renderAttributeMenu('y')}
                    position={Position.RIGHT}
                    isOpen={this.state.yMenuIsOpen}
                    onInteraction={handlePopoverInteraction}
                >
                    <div/>
                </Popover>
            </div>
        );
    }

    render() {
        if (!this.props.size.width || !this.props.size.height || !this.state.dataSet) {
            return null;
        }

        const kPointRadius: number = 6;

        const
            { dataSet, xAttrID, yAttrID } = this.state,
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

        let margin = {top: 20, right: 20, bottom: 30, left: 50},
            width: number = this.props.size.width - margin.left - margin.right,
            height: number = this.props.size.height - margin.top - margin.bottom,
            x = d3.scaleLinear()
                .range([0, width])
                .domain([xMin, xMax || 1]).nice(),

            y = d3.scaleLinear()
                .range([height, 0])
                .domain([yMin, yMax || 1]).nice(),

            coordinates = xValues.map(function (iX: number, i: number) {
                return {x: x(iX), y: y(yValues[i])};
            }),

            xAxis = d3.axisBottom(x),

            yAxis = d3.axisLeft(y),

            node = ReactFauxDOM.createElement('svg'),
            svg = d3.select(node)
                .attr('width', width + margin.left + margin.right)
                .attr('height', height + margin.top + margin.bottom)
                .append('g')
                .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

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

        svg.selectAll('circle')
            .data(coordinates)
            .enter().append('circle')
            .attr('cx', function (coords: { x: number, y: number }) {
                return coords.x;
            })
            .attr('cy', function (coords: { x: number, y: number }) {
                return coords.y;
            })
            .attr('r', kPointRadius)
            .attr('className', 'nc-point');

        // const {divWidth, divHeight} = this.props.size;
        return (
            <div className="neo-codap-graph">
                {node.toReact()}
                {this.renderXAxisPopover()}
                {this.renderYAxisPopover()}
            </div>
        );
    }
}

const sizeMeConfig = {
    monitorWidth: true,
    monitorHeight: true
};

export const Graph = sizeMe(sizeMeConfig)(GraphComponent);