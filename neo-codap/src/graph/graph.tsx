import * as React from 'react';
import * as ReactFauxDOM from 'react-faux-dom';
import * as d3 from 'd3';
import sizeMe from 'react-sizeme';
import { IAttribute } from '../data-manager/attribute';
import { ICase, IDataSet, IDerivationSpec } from '../data-manager/data-manager';
import { find } from 'lodash';
import './graph.css';

interface ISizeMeSize {
    width: number|null;
    height: number|null;
}
  
interface IGraphProps {
    size: ISizeMeSize;
    dataSet: IDataSet;
}

interface IGraphState {
    graphData: IDataSet;
    xAttrID?: string;
    yAttrID?: string;
}

export class GraphComponent extends React.Component<IGraphProps, IGraphState> {

    srcAttributesChanged: boolean = false;
    srcValuesChanged: boolean = false;

    constructor(props: IGraphProps) {
        super(props);

        this.state = {
            graphData: props.dataSet &&
                        this.createGraphData(props.dataSet, {} as IGraphState)
        };
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

    createGraphData(srcDataSet: IDataSet, state: IGraphState) {
        let { xAttrID, yAttrID } = state,
            xAttr: IAttribute, yAttr: IAttribute,
            attrIDs: string[] = [];
        if (!xAttrID) {
            xAttrID = this.findPlottableAttribute(srcDataSet);
            this.setState({ xAttrID });
        }
        if (xAttrID) {
            attrIDs.push(xAttrID);
            xAttr = srcDataSet.attrFromID(xAttrID);
        }
        if (!yAttrID) {
            yAttrID = this.findPlottableAttribute(srcDataSet, xAttrID);
            this.setState({ yAttrID });
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
            graphData = srcDataSet && srcDataSet.derive('graphData', derivationSpec);

        this.attachHandlers(undefined, graphData);
        return graphData;
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
                        this.setState({ graphData: this.createGraphData(srcData, this.state) });
                    }
                    break;
                case 'setCaseValues':
                case 'setCanonicalCaseValues':
                    if (srcData.isInTransaction) {
                        this.srcValuesChanged = true;
                    }
                    else if (graphDataIncomplete) {
                        this.setState({ graphData: this.createGraphData(srcData, this.state) });
                    }
                    break;
                case 'endTransaction':
                    if (!srcData.isInTransaction) {
                        if (graphDataIncomplete &&
                            (this.srcAttributesChanged || this.srcValuesChanged)) {
                            this.setState({ graphData: this.createGraphData(srcData, this.state) });
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

    detachHandlers(srcData: IDataSet, graphData: IDataSet) {
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
            this.detachHandlers(this.props.dataSet, this.state.graphData);
            const graphData = dataSet &&
                                this.createGraphData(dataSet, this.state);
            this.attachHandlers(dataSet, graphData);
            this.setState({ graphData });
        }
    }

    componentWillUnmount() {
        this.detachHandlers(this.props.dataSet, this.state.graphData);
    }

    render() {
        if (!this.props.size.width || !this.props.size.height) { return null; }

        const kPointRadius: number = 6;

        const
            { graphData, xAttrID, yAttrID } = this.state,
            graphCaseCount = graphData && graphData.cases.length;
        let xAttr = graphData.attrFromID(xAttrID || ''),
            yAttr = graphData.attrFromID(yAttrID || '');
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
            .text(xAttr ? xAttr.name : '');

        svg.append('g')
            .attr('class', 'y axis')
            .call(yAxis)
            .append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', -margin.left + 20)
            .attr('x', -height / 2)
            .style('text-anchor', 'middle')
            .text(yAttr ? yAttr.name : '');

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
{/*
                <div className="nc-graph-message">
                    Graph: {graphCaseCount} of {totalCaseCount} cases are plottable!
                </div>
*/}
                {node.toReact()}
            </div>
        );
    }
}

const sizeMeConfig = {
    monitorWidth: true,
    monitorHeight: true
};

export const Graph = sizeMe(sizeMeConfig)(GraphComponent);