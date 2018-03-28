import * as React from "react"
import * as ReactDOM from "react-dom";
import { DashboardComponent } from "./components/dashboard"
import "./styles/app.scss";

ReactDOM.render(
    <DashboardComponent />,
    document.getElementById("dashboard")
)