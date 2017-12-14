import * as React from "react"
import * as ReactDOM from "react-dom";
import { DashboardComponent } from "./components/dashboard"

const styles = require('./styles/app.scss')

ReactDOM.render(
    <DashboardComponent />,
    document.getElementById("dashboard")
)