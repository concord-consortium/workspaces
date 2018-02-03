import * as React from "react"
import * as firebase from "firebase"
import { EventEmitter, Events } from "../lib/events"
import { TOOLBAR_WIDTH } from "./toolbar"

const SELECTION_COLOR = "#ccff00"

export class SelectionBox {
  start: Point
  end: Point
  nw: Point
  se: Point

  constructor (x: number, y: number) {
    this.start = {x, y}
    this.end = {x, y}
    this.computeBox()
  }

  computeBox() {
    const minX = Math.min(this.start.x, this.end.x)
    const minY = Math.min(this.start.y, this.end.y)
    const maxX = Math.max(this.start.x, this.end.x)
    const maxY = Math.max(this.start.y, this.end.y)
    this.nw = {x: minX, y: minY}
    this.se = {x: maxX, y: maxY}
  }

  update(x: number, y:number) {
    this.end = {x, y}
    this.computeBox()
  }

  close() {
    this.computeBox()
  }

  contains(p:Point): boolean {
    const {nw, se} = this
    return (p.x >= nw.x) && (p.y >= nw.y) && (p.x <= se.x) && (p.y <= se.y)
  }

  render() {
    const {nw, se} = this
    return <rect x={nw.x} y={nw.y} width={se.x - nw.x} height={se.y - nw.y} fill="none" stroke={SELECTION_COLOR} strokeWidth="2" strokeDasharray="10 5" />
  }
}

export interface DrawingLayerViewProps {
  enabled: boolean
  firebaseRef: firebase.database.Reference
  events: EventEmitter
}

export interface DrawingLayerViewState {
  currentLine: Line|null
  objects: ObjectMap
  selectionBox: SelectionBox|null
}

export interface DrawingObject {
  selected: boolean
  serialize(): string
  inSelection(selectionBox:SelectionBox): boolean
  render(key:any, handleClick?:(obj:DrawingObject) => void): JSX.Element | null
}

export type DrawingObjectTypes = "line"

export interface Point {x: number, y: number}

export class Line implements DrawingObject {
  points: Point[]
  color: string
  selected: boolean

  constructor (json?:any) {
    this.points = []
    if (json) {
      this.points = json.points || []
      this.color = json.color || "#000"
    }
  }

  serialize() {
    return JSON.stringify({
      type: "line",
      color: this.color,
      points: this.points
    })
  }

  inSelection(selectionBox:SelectionBox) {
    const {points} = this
    for (let i = 0; i < points.length; i++) {
      if (selectionBox.contains(points[i])) {
        return true
      }
    }
    return false
  }

  render(key:any, handleClick?:(obj:DrawingObject) => void) : JSX.Element|null {
    if (this.points.length === 0) {
      return null
    }
    const stroke = this.selected ? SELECTION_COLOR : this.color
    const [first, ...rest] = this.points
    const commands = `M ${first.x} ${first.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(" ")}`
    return <path key={key} d={commands} stroke={stroke} fill="none" strokeWidth="3" onClick={() => handleClick ? handleClick(this) : null} />
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

export interface DrawingToolMap {
  [key: string]: DrawingTool
}

export interface DrawingTool {
  handleMouseDown?(e:React.MouseEvent<HTMLDivElement>): void
  handleObjectClick?(obj:DrawingObject): void
}

export class LineDrawingTool implements DrawingTool {
  drawingLayer:DrawingLayerView
  color: string

  constructor(drawingLayer:DrawingLayerView) {
    this.drawingLayer = drawingLayer
    this.color = "#000"
  }

  setColor(color:string) {
    this.color = color
    return this
  }

  handleMouseDown(e:React.MouseEvent<HTMLDivElement>) {
    const line:Line = new Line({color: this.color})
    const addPoint = (e:MouseEvent|React.MouseEvent<HTMLDivElement>) => {
      if ((e.clientX >= 0) && (e.clientY >= 0)) {
        line.points.push({x: e.clientX - TOOLBAR_WIDTH, y: e.clientY})
        this.drawingLayer.setState({currentLine: line})
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
        this.drawingLayer.objectsRef.push(line.serialize())
      }
      this.drawingLayer.setState({currentLine: null})
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }

    addPoint(e)
    this.drawingLayer.setState({currentLine: line})
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
  }
}

export class SelectionDrawingTool implements DrawingTool {
  drawingLayer:DrawingLayerView

  constructor(drawingLayer:DrawingLayerView) {
    this.drawingLayer = drawingLayer
  }

  handleMouseDown(e:React.MouseEvent<HTMLDivElement>) {
    const handleMouseMove = (e:MouseEvent) => {
      this.drawingLayer.updateSelectionBox(e.clientX - TOOLBAR_WIDTH, e.clientY)
    }
    const handleMouseUp = (e:MouseEvent) => {
      this.drawingLayer.endSelectionBox()
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }

    this.drawingLayer.startSelectionBox(e.clientX - TOOLBAR_WIDTH, e.clientY)
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
  }

  handleObjectClick(obj:DrawingObject) {
    obj.selected = true
    this.drawingLayer.forceUpdate()
  }
}

export class DrawingLayerView extends React.Component<DrawingLayerViewProps, DrawingLayerViewState> {
  objects: ObjectMap
  objectsRef: firebase.database.Reference
  currentTool: DrawingTool|null
  tools: DrawingToolMap

  constructor(props:DrawingLayerViewProps){
    super(props)

    this.state = {
      currentLine: null,
      objects: {},
      selectionBox: null
    }

    this.tools = {
      line: new LineDrawingTool(this),
      selection: new SelectionDrawingTool(this)
    }
    this.currentTool = null

    this.objects = {}
    this.addListeners()
  }

  addListeners() {
    window.addEventListener("keyup", (e) => {
      if (this.props.enabled) {
        switch (e.keyCode) {
          case 46:
            this.handleDelete()
            break;
        }
      }
    })
    this.props.events.listen(Events.EditModeSelected, () => this.setCurrentTool(null))
    this.props.events.listen(Events.LineDrawingToolSelected, (data) => this.setCurrentTool((this.tools.line as LineDrawingTool).setColor(data.color)))
    this.props.events.listen(Events.SelectionToolSelected, () => this.setCurrentTool(this.tools.selection))
    this.props.events.listen(Events.DeletePressed, this.handleDelete)

    this.objectsRef = this.props.firebaseRef.child("drawing").child("objects")

    this.objectsRef.on("child_added", (snapshot) => {
      if (snapshot && snapshot.key) {
        const val = snapshot.val()
        const json = val ? JSON.parse(val) : null
        if (json) {
          let Object = objectConstructors[json.type]
          if (Object) {
            this.state.objects[snapshot.key] = new Object(json)
            this.setState({objects: this.state.objects})
          }
        }
      }
    })

    this.objectsRef.on("child_removed", (snapshot) => {
      if (snapshot && snapshot.key) {
        delete this.state.objects[snapshot.key]
        this.setState({objects: this.state.objects})
      }
    })
  }

  setCurrentTool(tool:DrawingTool|null) {
    this.currentTool = tool
    this.setState({selectionBox: null})

    if (tool !== this.tools.selection) {
      this.forEachObject((object) => {
        object.selected = false
      })
      this.forceUpdate()
    }
  }

  forEachObject(callback: (object:DrawingObject, key?:string) => void) {
    const {objects} = this.state
    Object.keys(objects).forEach((key) => {
      const object = objects[key]
      if (object) {
        callback(object, key)
      }
    })
  }

  handleDelete = () => {
    if (this.props.enabled) {
      const updates:any = {}
      this.forEachObject((object, key) => {
        if (object.selected && key) {
          updates[key] = null
        }
      })
      if (Object.keys(updates).length > 0) {
        this.objectsRef.update(updates)
      }
    }
  }

  handleMouseDown = (e:React.MouseEvent<HTMLDivElement>) => {
    if (this.currentTool && this.currentTool.handleMouseDown) {
      this.currentTool.handleMouseDown(e)
    }
  }

  handleObjectClick = (obj:DrawingObject) => {
    if (this.currentTool && this.currentTool.handleObjectClick) {
      this.currentTool.handleObjectClick(obj)
    }
  }

  startSelectionBox(x:number, y: number) {
    this.setState({selectionBox: new SelectionBox(x, y)})
  }

  updateSelectionBox(x:number, y: number) {
    const {selectionBox} = this.state
    if (selectionBox) {
      selectionBox.update(x, y)
      this.setState({selectionBox})
    }
  }

  endSelectionBox() {
    const {selectionBox} = this.state
    if (selectionBox) {
      selectionBox.close()
      this.forEachObject((object) => {
        object.selected = object.inSelection(selectionBox)
      })
      this.setState({selectionBox: null})
    }
  }

  renderObject = (key:string) => {
    const object = this.state.objects[key]
    return object ? object.render(key, this.handleObjectClick) : null
  }

  renderSVG() {
    return (
      <svg>
        {Object.keys(this.state.objects).map(this.renderObject)}
        {this.state.currentLine ? this.state.currentLine.render("current") : null}
        {this.state.selectionBox ? this.state.selectionBox.render() : null}
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