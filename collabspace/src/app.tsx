import * as React from "react"
import * as ReactDOM from "react-dom";
import { AppComponent } from "./components/app"

const styles = require('./styles/app.scss')

ReactDOM.render(
    <AppComponent />,
    document.getElementById("app")
)