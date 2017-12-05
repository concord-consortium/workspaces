import * as React from 'react';
import './App.css';
import { addAttributeToDataSet, addCasesToDataSet, ICase, DataSet, IDataSet } from './data-manager/data-manager';
import { CaseTable } from './case-table/case-table';
const fourSeals = require('./four-seals.json');

export interface IAppProps {

}

export interface IAppState {
  dataSet: IDataSet;
}

class App extends React.Component<IAppProps, IAppState> {

  constructor(props: IAppProps) {
    super(props);

    const dataSet = DataSet.create({ name: 'four-seals' });

    this.state = {
      dataSet
    };

    const firstCase = fourSeals && fourSeals[0];
    for (let name in firstCase) {
      addAttributeToDataSet(dataSet, { name });
    }
    addCasesToDataSet(dataSet, fourSeals as {} as ICase[]);
  }

  render() {
    return (
      <CaseTable dataSet={this.state.dataSet} />
    );
  }
}

export default App;
