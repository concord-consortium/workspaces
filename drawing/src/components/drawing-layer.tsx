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
  currentLine: Line|null
  objects: ObjectMap
}

export interface DrawingObject {
  serialize(): string
  render(key?:any): JSX.Element | null
}

export type DrawingObjectTypes = "line"

export interface Point {x: number, y: number}

export class Line implements DrawingObject {
  points: Point[]

  constructor (json?:any) {
    this.points = []
    if (json) {
      this.points = json.points
    }
  }

  serialize() {
    return JSON.stringify({
      type: "line",
      points: this.points
    })
  }

  render(key:any) {
    if (this.points.length === 0) {
      return null
    }
    const [first, ...rest] = this.points
    const commands = `M ${first.x} ${first.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(" ")}`
    return <path key={key} d={commands} stroke="black" fill="none" strokeWidth="3" />
  }
}

interface ObjectConstructorMap {
  [key: string]: (typeof Line)|null
}
const objectConstructors:ObjectConstructorMap = {
  "line": Line
}

interface ObjectMap {
  [key: string]: DrawingObject|null
}

export class DrawingLayerView extends React.Component<DrawingLayerViewProps, DrawingLayerViewState> {
  objects: ObjectMap
  objectsRef: firebase.database.Reference

  constructor(props:DrawingLayerViewProps){
    super(props)

    this.state = {
      currentLine: null,
      objects: {}
    }

    this.objects = {}
    this.addListeners()
  }

  addListeners() {
    this.objectsRef = this.props.firebaseRef.child("drawing").child("objects")
    this.objectsRef.on("child_added", (snapshot) => {
      if (snapshot && snapshot.key) {
        const val = snapshot.val()
        const json = val ? JSON.parse(val) : null
        if (!json) {
          return
        }
        let Object = objectConstructors[json.type]
        if (Object) {
          this.state.objects[snapshot.key] = new Object(json)
          this.setState({objects: this.state.objects})
        }
      }
    })
  }

  handleMouseDown = (e:React.MouseEvent<HTMLDivElement>) => {
    const line:Line = new Line()
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
      if (!((line.points.length === 2) && (first.x === last.x) && (first.y === last.y))) {
        this.objectsRef.push(line.serialize())
      }
      this.setState({currentLine: null})
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }

    addPoint(e)
    this.setState({currentLine: line})
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
  }

  renderObject = (key:string) => {
    const object = this.state.objects[key]
    return object ? object.render(key) : null
  }

  renderSVG() {
    return (
      <svg>
        {Object.keys(this.state.objects).map(this.renderObject)}
        {this.state.currentLine ? this.state.currentLine.render("current") : null}
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