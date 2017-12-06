import * as React from 'react';
import { ICase, IDataSet, IDerivationSpec } from '../data-manager/data-manager';
import './graph.css';

interface IGraphProps {
  dataSet: IDataSet;
}

interface IGraphState {
  graphData: IDataSet;
}

export class Graph extends React.Component<IGraphProps, IGraphState> {

  constructor(props: IGraphProps) {
    super(props);

    const xAttrName = 'Mass',
          yAttrName = 'Speed',
          massAttr = props.dataSet && props.dataSet.attrFromName(xAttrName),
          massAttrID = massAttr && massAttr.id,
          speedAttr = props.dataSet && props.dataSet.attrFromName(yAttrName),
          speedAttrID = speedAttr && speedAttr.id,
          attrIDs: string[] = [];
    if (massAttrID) { attrIDs.push(massAttrID); }
    if (speedAttrID) { attrIDs.push(speedAttrID); }

    const derivationSpec: IDerivationSpec = {
            attributeIDs: attrIDs,
            filter: (aCase: ICase) => {
              let x = aCase[xAttrName],
                  y = aCase[yAttrName];
              // exclude missing values
              if ((x == null) || (x === '') || (y == null) || (y === '')) { return undefined; }
              // convert to numeric
              x = Number(x);
              y = Number(y);
              // exclude NaNs & infinities
              if (!isFinite(x) || !isFinite(y)) { return undefined; }
              // return the filtered case
              aCase[xAttrName] = x;
              aCase[yAttrName] = y;
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
    const { dataSet } = this.props,
          { graphData } = this.state,
          totalCaseCount = dataSet && dataSet.cases.length,
          graphCaseCount = graphData && graphData.cases.length;

    return (
      <div className="neo-codap-graph">
        <div className="nc-graph-message">
          Graph: {graphCaseCount} of {totalCaseCount} cases are plottable!
        </div>
      </div>
    );
  }
}
