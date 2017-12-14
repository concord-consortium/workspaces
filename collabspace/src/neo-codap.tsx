import * as React from 'react';
import * as ReactDOM from 'react-dom';
import NeoCodapComponent from './components/neo-codap';
import registerServiceWorker from '../../neo-codap/src/registerServiceWorker';
import '../../neo-codap/src/index.css';

ReactDOM.render(
  <NeoCodapComponent />,
  document.getElementById('root') as HTMLElement
);
registerServiceWorker();
