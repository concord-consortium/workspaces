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
  currentLine: LineObject|null
  objects: ObjectMap
  selectionBox: SelectionBox|null
}

export interface DrawingObject {
  key: string|null
  selected: boolean
  serialize(): string
  inSelection(selectionBox:SelectionBox): boolean
  render(key:any, handleClick?:(obj:DrawingObject) => void): JSX.Element | null
}

export type DrawingObjectTypes = "line"

export interface Point {x: number, y: number}

export class LineObject implements DrawingObject {
  key: string|null
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
    const [first, ...rest] = this.points
    const commands = `M ${first.x} ${first.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(" ")}`
    const filter = this.selected ? "url(#highlight)" : ""
    return <path key={key} d={commands} filter={filter} stroke={this.color} fill="none" strokeWidth="3" onClick={() => handleClick ? handleClick(this) : null} />
  }
}

export class ImageObject implements DrawingObject {
  key: string|null
  selected: boolean
  x: number
  y: number
  src: string

  constructor (json?:any) {
    this.src = json ? json.src : ""
    this.x = json ? json.x : 0
    this.y = json ? json.y : 0
  }

  serialize() {
    return JSON.stringify({
      type: "image",
      src: this.src,
      x: this.x,
      y: this.y
    })
  }

  inSelection(selectionBox:SelectionBox) {
    const {x, y} = this
    return selectionBox.contains({x, y})
  }

  render(key:any, handleClick?:(obj:DrawingObject) => void) : JSX.Element|null {
    const filter = this.selected ? "url(#highlight)" : ""
    return <image key={key} xlinkHref={this.src} x={this.x} y={this.y} filter={filter} onClick={() => handleClick ? handleClick(this) : null} />
  }
}

interface ObjectConstructorMap {
  [key: string]: (typeof LineObject)|(typeof ImageObject)|null
}
const objectConstructors:ObjectConstructorMap = {
  "line": LineObject,
  "image": ImageObject
}

interface ObjectMap {
  [key: string]: DrawingObject|null
}

export interface DrawingToolMap {
  [key: string]: DrawingTool
}

export interface DrawingTool {
  handleMouseDown?(e:React.MouseEvent<HTMLDivElement>): void
  handleClick?(e:React.MouseEvent<HTMLDivElement>): void
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
    const line:LineObject = new LineObject({color: this.color})
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
        this.drawingLayer.commandManager.execute(new ToggleObjectCommand(line))
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

export class ImageDrawingTool implements DrawingTool {
  drawingLayer:DrawingLayerView
  src: string

  constructor(drawingLayer:DrawingLayerView) {
    this.drawingLayer = drawingLayer
  }

  setSrc(src:string) {
    this.src = src
    return this
  }

  handleClick(e:React.MouseEvent<HTMLDivElement>) {
    const image:ImageObject = new ImageObject({x: e.clientX - TOOLBAR_WIDTH, y: e.clientY, src: this.src})
    this.drawingLayer.commandManager.execute(new ToggleObjectCommand(image))
  }
}

export interface Command {
  undo(drawingLayer:DrawingLayerView): void
  execute(drawingLayer:DrawingLayerView): void
}

export class ToggleObjectCommand implements Command {
  key: string|null
  object: DrawingObject

  constructor (object:DrawingObject) {
    this.object = object
  }

  execute(drawingLayer:DrawingLayerView) {
    drawingLayer.addObject(this.object)
  }

  undo(drawingLayer:DrawingLayerView) {
    drawingLayer.deleteObject(this.object)
  }
}

export class DeleteObjectsCommand implements Command {
  objects: DrawingObject[]

  constructor (objects:DrawingObject[]) {
    this.objects = objects
  }

  execute(drawingLayer:DrawingLayerView) {
    this.objects.forEach((object) => drawingLayer.deleteObject(object))
  }

  undo(drawingLayer:DrawingLayerView) {
    this.objects.forEach((object) => drawingLayer.addObject(object))
  }
}

export class CommandManager {
  drawingLayer: DrawingLayerView
  stack: Command[]
  stackIndex: number

  constructor(drawingLayer:DrawingLayerView) {
    this.drawingLayer = drawingLayer
    this.stack = []
    this.stackIndex = -1
  }

  execute(command:Command) {
    command.execute(this.drawingLayer)
    this.stack.splice(this.stackIndex + 1)
    this.stack.push(command)
    this.stackIndex = this.stack.length - 1
  }

  undo() {
    if (this.canUndo()) {
      const command = this.stack[this.stackIndex--]
      command.undo(this.drawingLayer)
    }
  }

  redo() {
    if (this.canRedo()) {
      const command = this.stack[++this.stackIndex]
      command.execute(this.drawingLayer)
    }
  }

  canUndo() {
    return this.stackIndex >= 0
  }

  canRedo() {
    return this.stackIndex < this.stack.length - 1
  }
}

export class DrawingLayerView extends React.Component<DrawingLayerViewProps, DrawingLayerViewState> {
  objects: ObjectMap
  objectsRef: firebase.database.Reference
  currentTool: DrawingTool|null
  tools: DrawingToolMap
  commandManager: CommandManager

  constructor(props:DrawingLayerViewProps){
    super(props)

    this.state = {
      currentLine: null,
      objects: {},
      selectionBox: null
    }

    this.commandManager = new CommandManager(this)

    this.tools = {
      line: new LineDrawingTool(this),
      selection: new SelectionDrawingTool(this),
      image: new ImageDrawingTool(this)
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
            this.props.events.emit(Events.DeletePressed)
            break
          case 89:
            if (e.ctrlKey || e.metaKey) {
              this.props.events.emit(Events.RedoPressed)
            }
            break
          case 90:
            if (e.ctrlKey || e.metaKey) {
              this.props.events.emit(Events.UndoPressed)
            }
            break
        }
      }
    })
    this.props.events.listen(Events.EditModeSelected, () => this.setCurrentTool(null))
    this.props.events.listen(Events.LineDrawingToolSelected, (data) => this.setCurrentTool((this.tools.line as LineDrawingTool).setColor(data.color)))
    this.props.events.listen(Events.SelectionToolSelected, () => this.setCurrentTool(this.tools.selection))
    this.props.events.listen(Events.CoinToolSelected, (data) => this.setCurrentTool((this.tools.image as ImageDrawingTool).setSrc(data.image)))
    this.props.events.listen(Events.PouchToolSelected, (data) => this.setCurrentTool((this.tools.image as ImageDrawingTool).setSrc(data.image)))

    this.props.events.listen(Events.UndoPressed, () => this.commandManager.undo())
    this.props.events.listen(Events.RedoPressed, () => this.commandManager.redo())
    this.props.events.listen(Events.DeletePressed, this.handleDelete)

    this.objectsRef = this.props.firebaseRef.child("drawing").child("objects")

    this.objectsRef.on("child_added", (snapshot) => {
      if (snapshot && snapshot.key) {
        const val = snapshot.val()
        const json = val ? JSON.parse(val) : null
        if (json) {
          let Object = objectConstructors[json.type]
          if (Object) {
            const object = new Object(json)
            object.key = snapshot.key
            this.state.objects[snapshot.key] = object
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

  addObject(object:DrawingObject) {
    object.key = this.objectsRef.push(object.serialize()).key
  }

  deleteObject(object:DrawingObject) {
    if (object.key) {
      this.objectsRef.child(object.key).set(null)
    }
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
      const objects:DrawingObject[] = []
      this.forEachObject((object) => {
        if (object.selected) {
          objects.push(object)
        }
      })
      if (objects.length > 0) {
        this.commandManager.execute(new DeleteObjectsCommand(objects))
      }
    }
  }

  handleMouseDown = (e:React.MouseEvent<HTMLDivElement>) => {
    if (this.currentTool && this.currentTool.handleMouseDown) {
      this.currentTool.handleMouseDown(e)
    }
  }

  handleClick = (e:React.MouseEvent<HTMLDivElement>) => {
    if (this.currentTool && this.currentTool.handleClick) {
      this.currentTool.handleClick(e)
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
      <svg xmlnsXlink= "http://www.w3.org/1999/xlink">
        <filter id="highlight">
          <feMorphology result="offset" in="SourceGraphic" operator="dilate" radius="3"/>
          <feColorMatrix result="drop" in="offset" type="matrix" values="1 1 1 1 1 1 1 1 1 1 0 0 0 0 0 0 0 0 1 0" />
          <feBlend in="SourceGraphic" in2="drop" mode="normal" />
        </filter>
        {Object.keys(this.state.objects).map(this.renderObject)}
        {this.state.currentLine ? this.state.currentLine.render("current") : null}
        {this.state.selectionBox ? this.state.selectionBox.render() : null}
      </svg>
    )
  }

  render() {
    const style = this.props.enabled ? {} : {pointerEvents: "none"};
    return (
      <div className="drawing-layer" style={style} onMouseDown={this.handleMouseDown} onClick={this.handleClick}>
        {this.renderSVG()}
      </div>
    )
  }
}