import * as React from 'react';
import './App.css';
import { addAttributeToDataSet, addCasesToDataSet, ICase, DataSet, IDataSet } from './data-manager/data-manager';
import { CaseTable } from './case-table/case-table';
import { Graph } from './graph/graph';
import * as queryString from 'query-string';
const urlParams = queryString.parse(location.search),
      mode = urlParams.mode != null ? urlParams.mode : 'all',
      fourSeals = require('./four-seals.json'),
      mammals = require('./mammals.json'),
      chosenDataSetName = 'mammals',
      rawData = { fourSeals, mammals }[chosenDataSetName],
      showTable = (mode === 'all') || (mode === 'table'),
      showGraph = (mode === 'all') || (mode === 'graph');

export interface IAppProps {

}

export interface IAppState {
  dataSet: IDataSet;
}

class App extends React.Component<IAppProps, IAppState> {

  constructor(props: IAppProps) {
    super(props);

    const dataSet = DataSet.create({ name: chosenDataSetName });

    this.state = {
      dataSet
    };

    const firstCase = rawData && rawData[0];
    for (let name in firstCase) {
      addAttributeToDataSet(dataSet, { name });
    }
    addCasesToDataSet(dataSet, rawData as {} as ICase[]);
  }

  renderTable() {
    return showTable
            ? (
                <div className="neo-codap-app-item">
                  <CaseTable dataSet={this.state.dataSet} />
                </div>
              )
            : null;
  }

  renderGraph() {
    return showGraph
            ? (
                <div className="neo-codap-app-item">
                  <Graph dataSet={this.state.dataSet} />
                </div>
              )
            : null;
  }

  render() {
    return (
      <div className="neo-codap-app">
        {this.renderTable()}
        {this.renderGraph()}
      </div>
    );
  }
}

export default App;
