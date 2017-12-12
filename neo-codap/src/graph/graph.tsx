import * as React from 'react';
import * as ReactFauxDOM from 'react-faux-dom';
import * as d3 from 'd3';
import sizeMe from 'react-sizeme';
import {ICase, IDataSet, IDerivationSpec} from '../data-manager/data-manager';
import './graph.css';

interface ISizeMeSize {
    width: number;
    height: number;
}

interface IGraphProps {
    size: ISizeMeSize;
    dataSet: IDataSet;
}

interface IGraphState {
    graphData: IDataSet;
}

export class GraphComponent extends React.Component<IGraphProps, IGraphState> {

    xAttributeName: string = 'Sleep';
    yAttributeName: string = 'Speed';

    constructor(props: IGraphProps) {
        super(props);

        const
            xAttr = props.dataSet && props.dataSet.attrFromName(this.xAttributeName),
            xAttrID = xAttr && xAttr.id,
            yAttr = props.dataSet && props.dataSet.attrFromName(this.yAttributeName),
            yAttrID = yAttr && yAttr.id,
            attrIDs: string[] = [];
        if (xAttrID) {
            attrIDs.push(xAttrID);
        }
        if (yAttrID) {
            attrIDs.push(yAttrID);
        }

        const derivationSpec: IDerivationSpec = {
                attributeIDs: attrIDs,
                filter: (aCase: ICase) => {
                    let x = aCase[this.xAttributeName],
                        y = aCase[this.yAttributeName];
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
                    aCase[this.xAttributeName] = x;
                    aCase[this.yAttributeName] = y;
                    return aCase;
                },
                synchronize: true
            },
            graphData = props.dataSet && props.dataSet.derive('graphData', derivationSpec);

        this.state = {
            graphData: graphData
        };
    }

    render() {
        const kPointRadius:number = 6;

        const /*{dataSet} = this.props,*/
            {graphData} = this.state/*,
            totalCaseCount = dataSet && dataSet.cases.length,
            graphCaseCount = graphData && graphData.cases.length*/;
        let xAttr = graphData.attrFromName(this.xAttributeName),
            yAttr = graphData.attrFromName(this.yAttributeName);
        let xValues: number[] = xAttr ? xAttr.values as number[] : [],
            yValues: number[] = yAttr ? yAttr.values as number[] : [];
        let xMax = d3.max(xValues),
            yMax = d3.max(yValues);

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
            width:number = this.props.size.width - margin.left - margin.right,
            height:number = this.props.size.height - margin.top - margin.bottom,
            x = d3.scaleLinear()
                .range([0, width])
                .domain([0, xMax || 1]).nice(),

            y = d3.scaleLinear()
                .range([height, 0])
                .domain([0, yMax || 1]).nice(),

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
            .text(this.xAttributeName);

        svg.append('g')
            .attr('class', 'y axis')
            .call(yAxis)
            .append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', -margin.left + 20)
            .attr('x', -height / 2)
            .style('text-anchor', 'middle')
            .text(this.yAttributeName);

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
    monitorHeight: true,
    noPlaceholder: true
};

export const Graph = sizeMe(sizeMeConfig)(GraphComponent);