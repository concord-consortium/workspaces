import * as React from "react"
import * as ReactDOM from "react-dom";
import { DrawingToolComponent } from "./components/drawing-tool-v2"
import "../../drawing/src/styles/drawing.scss";

ReactDOM.render(
    <DrawingToolComponent />,
    document.getElementById("drawing-tool")
)