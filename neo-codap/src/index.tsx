import * as React from 'react';
import * as ReactDOM from 'react-dom';
import App from './App';
import registerServiceWorker from './registerServiceWorker';
import './index.css';
import { Strings } from '../../shared/strings'

const strings = new Strings("en-us")

ReactDOM.render(
  <App strings={strings} />,
  document.getElementById('root') as HTMLElement
);
registerServiceWorker();
