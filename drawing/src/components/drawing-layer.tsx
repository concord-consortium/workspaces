import * as React from "react"
import * as firebase from "firebase"
import { EventEmitter, Events } from "../lib/events"
import { TOOLBAR_WIDTH } from "./toolbar"

export interface DrawingLayerViewProps {
  enabled: boolean
  firebaseRef: firebase.database.Reference
  events: EventEmitter
}

export interface DrawingLayerViewState {
  currentLine: DrawingLine|null
  lines: DrawingLine[]
}

export interface DrawingPoint {x: number, y: number}
export interface DrawingLine {
  points: DrawingPoint[]
}

export class DrawingLayerView extends React.Component<DrawingLayerViewProps, DrawingLayerViewState> {
  constructor(props:DrawingLayerViewProps){
    super(props)

    this.state = {
      currentLine: null,
      lines: []
    }
  }

  refs: {
    svg: SVGElement
  }

  handleMouseDown = (e:React.MouseEvent<HTMLDivElement>) => {
    const line:DrawingLine = {
      points: []
    }
    const addPoint = (e:MouseEvent|React.MouseEvent<HTMLDivElement>) => {
      if ((e.clientX >= 0) && (e.clientY >= 0)) {
        line.points.push({x: e.clientX - TOOLBAR_WIDTH, y: e.clientY})
        this.setState({currentLine: line})
      }
    }

    const handleMouseMove = (e:MouseEvent) => {
      addPoint(e)
    }
    const handleMouseUp = (e:MouseEvent) => {
      addPoint(e)
      const first = line.points[0]
      const last = line.points[line.points.length - 1]
      if (!((first.x === last.x) && (first.y === last.y))) {
        this.state.lines.push(line)
      }
      this.setState({
        currentLine: null,
        lines: this.state.lines
      })
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }

    addPoint(e)
    this.setState({currentLine: line})
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
  }

  renderPath(line:DrawingLine, key:any) {
    if (line.points.length === 0) {
      return null
    }
    const [first, ...rest] = line.points
    const commands = `M ${first.x} ${first.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(" ")}`
    return <path key={key} d={commands} stroke="black" fill="none" strokeWidth="3" />
  }

  renderSVG() {
    return (
      <svg ref="svg">
        {this.state.lines.map(this.renderPath)}
        {this.state.currentLine ? this.renderPath(this.state.currentLine, "current") : null}
      </svg>
    )
  }

  render() {
    const style = this.props.enabled ? {} : {pointerEvents: "none"};
    return (
      <div className="drawing-layer" style={style} onMouseDown={this.handleMouseDown}>
        {this.renderSVG()}
      </div>
    )
  }
}