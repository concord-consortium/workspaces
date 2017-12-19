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

interface IAppProps {
  dataSet?: IDataSet;
  onDOMNodeRef?: (ref: HTMLElement | null) => void;
}

interface IAppState {
  dataSet: IDataSet;
}

class App extends React.Component<IAppProps, IAppState> {

  constructor(props: IAppProps) {
    super(props);

    const dataSet = this.props.dataSet || DataSet.create({ name: chosenDataSetName });
    this.initializeDataSetIfEmpty(dataSet);

    this.state = {
      dataSet
    };
  }

  initializeDataSetIfEmpty(dataSet?: IDataSet) {
    if (dataSet && !dataSet.attributes.length && !dataSet.cases.length) {
      this.loadDataSetFromDefaultData(dataSet);
    }
  }

  loadDataSetFromDefaultData(dataSet: IDataSet) {
    dataSet.setName(chosenDataSetName);
    const firstCase = rawData && rawData[0];
    for (let name in firstCase) {
      addAttributeToDataSet(dataSet, { name });
    }
    addCasesToDataSet(dataSet, rawData as {} as ICase[]);
  }

  componentWillReceiveProps(nextProps: IAppProps) {
    const { dataSet } = nextProps;
    if (dataSet && (dataSet !== this.props.dataSet)) {
      this.initializeDataSetIfEmpty(dataSet);
      this.setState({ dataSet });
    }
  }

  renderTable() {
    const widthClass = showTable && showGraph ? 'half-width' : 'full-width',
          classes = `neo-codap-app-item ${widthClass}`;
    return showTable
            ? (
                <div className={classes}>
                  <CaseTable dataSet={this.state.dataSet} />
                </div>
              )
            : null;
  }

  renderGraph() {
    const widthClass = showTable && showGraph ? 'half-width' : 'full-width',
          classes = `neo-codap-app-item ${widthClass}`;
    return showGraph && this.props.dataSet
            ? (
              <div className={classes}>
                  <Graph dataSet={this.state.dataSet} />
                </div>
              )
            : null;
  }

  render() {
    return (
      <div className="neo-codap-app" ref={this.props.onDOMNodeRef}>
        {this.renderTable()}
        {this.renderGraph()}
      </div>
    );
  }
}

export default App;
