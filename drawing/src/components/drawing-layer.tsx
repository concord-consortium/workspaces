import * as React from "react"
import * as firebase from "firebase"
import { EventEmitter, Events } from "../lib/events"
import { TOOLBAR_WIDTH, ImageButtonData, LineButtonData } from "./toolbar"

const SELECTION_COLOR = "#777"
const HOVER_COLOR = "#ccff00"
const SELECTION_BOX_PADDING = 10

export const getWorkspacePoint = (e:MouseEvent|React.MouseEvent<any>):Point => {
  return {x: e.clientX - TOOLBAR_WIDTH, y: e.clientY}
}

export interface ImageSetItem {
  src: string
  width: number
  height: number
  title: string
}

export class SelectionBox {
  start: Point
  end: Point
  nw: Point
  se: Point

  constructor (start:Point) {
    this.start = start
    this.end = start
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

  update(p:Point) {
    this.end = p
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

export interface ImageDataUriMap {
  [key: string]: string|null
}

export interface DrawingLayerViewProps {
  enabled: boolean
  firebaseRef: firebase.database.Reference
  events: EventEmitter
  imageSetItems: ImageSetItem[]
}

export interface DrawingLayerViewState {
  currentLine: LineObject|null
  objects: ObjectMap
  selectedObjects: DrawingObject[]
  selectionBox: SelectionBox|null
  hoverObject: DrawingObject|null
  svgWidth: number|string
  svgHeight: number|string
  imageDataUriCache: ImageDataUriMap
}

export interface BoundingBox {
  nw: Point
  se: Point
}
export interface DrawingObjectOptions {
  key:any
  handleClick?:(e:MouseEvent|React.MouseEvent<any>, obj:DrawingObject) => void
  handleHover?:(e:MouseEvent|React.MouseEvent<any>, obj:DrawingObject, hovering: boolean) => void
  drawingLayer?: DrawingLayerView
}
export interface DrawingObject {
  key: string|null
  x: number
  y: number
  serialize(): string
  update(json:any): void
  inSelection(selectionBox:SelectionBox): boolean
  getBoundingBox(): BoundingBox
  render(options:DrawingObjectOptions): JSX.Element | null
}

export type DrawingObjectTypes = "line"

export interface Point {x: number, y: number}
export interface DeltaPoint {dx: number, dy: number}

export class LineObject implements DrawingObject {
  key: string|null
  x: number
  y: number
  deltaPoints: DeltaPoint[]
  color: string

  constructor (json?:any) {
    this.x = json ? (json.x || 0) : 0
    this.y = json ? (json.y || 0) : 0
    this.deltaPoints = json ? (json.deltaPoints || []) : []
    this.color = json ? (json.color || "#000") : "#000"
  }

  serialize() {
    return JSON.stringify({
      type: "line",
      color: this.color,
      x: this.x,
      y: this.y,
      deltaPoints: this.deltaPoints
    })
  }

  update(json:any) {
    this.x = json.x || this.x
    this.y = json.y || this.y
    this.deltaPoints = json.deltaPoints || this.deltaPoints
    this.color = json.color || this.color
  }

  inSelection(selectionBox:SelectionBox) {
    const {x, y, deltaPoints} = this
    for (let i = 0; i < deltaPoints.length; i++) {
      const {dx, dy} = deltaPoints[i]
      const point:Point = {x: x + dx, y: y + dy}
      if (selectionBox.contains(point)) {
        return true
      }
    }
    return false
  }

  getBoundingBox() {
    const {x, y} = this
    const nw:Point = {x, y}
    const se:Point = {x, y}
    let lastPoint:Point = {x, y}
    this.deltaPoints.forEach((dp) => {
      nw.x = Math.min(nw.x, lastPoint.x + dp.dx)
      nw.y = Math.min(nw.y, lastPoint.y + dp.dy)
      se.x = Math.max(se.x, lastPoint.x + dp.dx)
      se.y = Math.max(se.y, lastPoint.y + dp.dy)
      lastPoint = {x: lastPoint.x + dp.dx, y: lastPoint.y + dp.dy}
    })
    nw.x -= SELECTION_BOX_PADDING
    nw.y -= SELECTION_BOX_PADDING
    se.x += SELECTION_BOX_PADDING
    se.y += SELECTION_BOX_PADDING
    return {nw, se}
  }

  render(options:DrawingObjectOptions) : JSX.Element|null {
    const {key, handleClick, handleHover} = options
    const commands = `M ${this.x} ${this.y} ${this.deltaPoints.map((point) => `l ${point.dx} ${point.dy}`).join(" ")}`
    return <path
              key={key}
              d={commands}
              stroke={this.color}
              fill="none"
              strokeWidth="3"
              onClick={(e) => handleClick ? handleClick(e, this) : null}
              onMouseEnter={(e) => handleHover ? handleHover(e, this, true) : null }
              onMouseLeave={(e) => handleHover ? handleHover(e, this, false) : null }
             />
  }
}

export class ImageObject implements DrawingObject {
  key: string|null
  x: number
  y: number
  imageSetItem: ImageSetItem

  constructor (json?:any) {
    this.imageSetItem = json ? json.imageSetItem : {src: "", width: 0, height: 0, title: ""}
    this.x = json ? json.x : 0
    this.y = json ? json.y : 0
  }

  serialize() {
    return JSON.stringify({
      type: "image",
      imageSetItem: this.imageSetItem,
      x: this.x,
      y: this.y
    })
  }

  update(json:any) {
    this.imageSetItem = json.imageSetItem || this.imageSetItem
    this.x = json.x || this.x
    this.y = json.y || this.y
  }

  inSelection(selectionBox:SelectionBox) {
    const {x, y} = this
    return selectionBox.contains({x, y})
  }

  getBoundingBox() {
    const {width, height} = this.imageSetItem
    const nw:Point = {x: this.x - SELECTION_BOX_PADDING, y: this.y - SELECTION_BOX_PADDING}
    const se:Point = {x: this.x + width + SELECTION_BOX_PADDING, y: this.y + height + SELECTION_BOX_PADDING}
    return {nw, se}
  }

  render(options:DrawingObjectOptions) : JSX.Element|null {
    const {key, handleClick, handleHover} = options
    const {imageSetItem} = this
    const src = options.drawingLayer && options.drawingLayer.state.imageDataUriCache[imageSetItem.src]
    if (!src) {
      return null
    }

    return <image
              key={key}
              xlinkHref={src}
              x={this.x}
              y={this.y}
              width={imageSetItem.width}
              height={imageSetItem.height}
              onClick={(e) => handleClick ? handleClick(e, this) : null}
              onMouseEnter={(e) => handleHover ? handleHover(e, this, true) : null }
              onMouseLeave={(e) => handleHover ? handleHover(e, this, false) : null }
            />
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
  handleObjectClick?(e:MouseEvent|React.MouseEvent<any>, obj:DrawingObject): void
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
    const start = getWorkspacePoint(e)
    const line:LineObject = new LineObject({x: start.x, y: start.y, color: this.color})

    let lastPoint = start
    const addPoint = (e:MouseEvent|React.MouseEvent<HTMLDivElement>) => {
      const p = getWorkspacePoint(e)
      if ((p.x >= 0) && (p.y >= 0)) {
        line.deltaPoints.push({dx: p.x - lastPoint.x, dy: p.y - lastPoint.y})
        lastPoint = p
        this.drawingLayer.setState({currentLine: line})
      }
    }

    const handleMouseMove = (e:MouseEvent) => {
      addPoint(e)
    }
    const handleMouseUp = (e:MouseEvent) => {
      if (line.deltaPoints.length > 0) {
        addPoint(e)
        this.drawingLayer.commandManager.execute(new ToggleObjectCommand(line))
      }
      this.drawingLayer.setState({currentLine: null})
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }

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
    e.preventDefault()
    const addToSelectedObjects = e.ctrlKey || e.metaKey
    const start = getWorkspacePoint(e)
    this.drawingLayer.startSelectionBox(start)


    const handleMouseMove = (e:MouseEvent) => {
      e.preventDefault()
      const p = getWorkspacePoint(e)
      this.drawingLayer.updateSelectionBox(p)
    }
    const handleMouseUp = (e:MouseEvent) => {
      e.preventDefault()
      this.drawingLayer.endSelectionBox(addToSelectedObjects)
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
  }

  handleObjectClick(e:React.MouseEvent<HTMLDivElement>, obj:DrawingObject) {
    const {selectedObjects} = this.drawingLayer.state
    const index = selectedObjects.indexOf(obj)
    if (index === -1) {
      selectedObjects.push(obj)
    }
    else {
      selectedObjects.splice(index, 1)
    }
    this.drawingLayer.setState({selectedObjects})
  }
}

export class ImageDrawingTool implements DrawingTool {
  drawingLayer:DrawingLayerView
  imageSetItem: ImageSetItem

  constructor(drawingLayer:DrawingLayerView) {
    this.drawingLayer = drawingLayer
  }

  setImageSetItem(imageSetItem:ImageSetItem) {
    this.imageSetItem = imageSetItem
    return this
  }

  handleClick(e:React.MouseEvent<HTMLDivElement>) {
    const p = getWorkspacePoint(e)
    const {width, height} = this.imageSetItem
    const image:ImageObject = new ImageObject({x: p.x - (width / 2), y: p.y - (height / 2), imageSetItem: this.imageSetItem})
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
    this.objects = objects.slice()
  }

  execute(drawingLayer:DrawingLayerView) {
    this.objects.forEach((object) => drawingLayer.deleteObject(object))
  }

  undo(drawingLayer:DrawingLayerView) {
    this.objects.forEach((object) => drawingLayer.addObject(object))
  }
}

export class MoveObjectsCommand implements Command {
  objects: DrawingObject[]
  start: Point[]
  end: Point[]

  constructor (objects:DrawingObject[], start:Point[], end:Point[]) {
    this.objects = objects.slice()
    this.start = start
    this.end = end
  }

  execute(drawingLayer:DrawingLayerView) {
    this.update(drawingLayer, this.end)
  }

  undo(drawingLayer:DrawingLayerView) {
    this.update(drawingLayer, this.start)
  }

  private update(drawingLayer:DrawingLayerView, points:Point[]) {
    this.objects.forEach((object, index) => {
      // make sure the object hasn't been deleted in the interim
      if (object.key && drawingLayer.state.objects[object.key]) {
        object.x = points[index].x
        object.y = points[index].y
        drawingLayer.updateObject(object)
      }
    })
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
      selectionBox: null,
      selectedObjects: [],
      hoverObject: null,
      svgWidth: "100%",
      svgHeight: "100%",
      imageDataUriCache: {}
    }

    this.commandManager = new CommandManager(this)

    this.tools = {
      line: new LineDrawingTool(this),
      selection: new SelectionDrawingTool(this),
      image: new ImageDrawingTool(this)
    }
    this.currentTool = null

    this.updateImageDataUriCache(this.props.imageSetItems)

    this.objects = {}
    this.addListeners()
  }

  componentWillMount() {
    window.addEventListener("resize", this.setSVGSize)
    this.setSVGSize()
  }

  componentWillReceiveProps(nextProps:DrawingLayerViewProps) {
    this.updateImageDataUriCache(nextProps.imageSetItems)
  }

  updateImageDataUriCache(imageSetItems:ImageSetItem[]) {
    imageSetItems.forEach((imageSetItem) => {
      if (!this.state.imageDataUriCache[imageSetItem.src]) {
        const image = new Image()
        image.onload = () => {
          const canvas = document.createElement("canvas") as HTMLCanvasElement
          canvas.width = imageSetItem.width
          canvas.height = imageSetItem.height
          const context = canvas.getContext("2d")
          if (context) {
            context.drawImage(image, 0, 0)
            this.state.imageDataUriCache[imageSetItem.src] = canvas.toDataURL("image/png")
            this.setState({imageDataUriCache: this.state.imageDataUriCache})
          }
        }
        image.src = imageSetItem.src
      }
    })
  }

  setSVGSize = () => {
    this.setState({svgWidth: window.innerWidth - TOOLBAR_WIDTH, svgHeight: window.innerHeight})
  }

  addListeners() {
    window.addEventListener("keyup", (e) => {
      if (this.props.enabled) {
        switch (e.keyCode) {
          case 8:
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
    this.props.events.listen(Events.LineDrawingToolSelected, (data:LineButtonData) => this.setCurrentTool((this.tools.line as LineDrawingTool).setColor(data.lineColor.hex)))
    this.props.events.listen(Events.SelectionToolSelected, () => this.setCurrentTool(this.tools.selection))
    this.props.events.listen(Events.ImageToolSelected, (data:ImageButtonData) => this.setCurrentTool((this.tools.image as ImageDrawingTool).setImageSetItem(data.imageSetItem)))

    this.props.events.listen(Events.UndoPressed, () => this.commandManager.undo())
    this.props.events.listen(Events.RedoPressed, () => this.commandManager.redo())
    this.props.events.listen(Events.DeletePressed, this.handleDelete)

    this.objectsRef = this.props.firebaseRef.child("drawing").child("objects")

    this.objectsRef.on("child_added", (snapshot) => {
      if (snapshot && snapshot.key) {
        const val = snapshot.val()
        const json = val ? JSON.parse(val) : null
        if (json) {
          let ObjectConstructor = objectConstructors[json.type]
          if (ObjectConstructor) {
            const object = new ObjectConstructor(json)
            object.key = snapshot.key
            this.state.objects[snapshot.key] = object
            this.setState({objects: this.state.objects})
          }
        }
      }
    })

    this.objectsRef.on("child_changed", (snapshot) => {
      if (snapshot && snapshot.key) {
        const val = snapshot.val()
        const json = val ? JSON.parse(val) : null
        const object = this.state.objects[snapshot.key]
        if (json && object) {
          object.update(json)
          this.forceUpdate()
        }
      }
    })

    this.objectsRef.on("child_removed", (snapshot) => {
      if (snapshot && snapshot.key) {
        const object = this.state.objects[snapshot.key]
        if (object) {
          const {selectedObjects} = this.state
          const index = selectedObjects.indexOf(object)
          if (index !== -1) {
            selectedObjects.splice(index, 1)
          }
          delete this.state.objects[snapshot.key]
          this.setState({objects: this.state.objects, selectedObjects})
        }
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

  updateObject(object:DrawingObject) {
    if (object.key) {
      this.objectsRef.child(object.key).set(object.serialize())
    }
  }

  setCurrentTool(tool:DrawingTool|null) {
    this.currentTool = tool
    this.setState({selectionBox: null, selectedObjects: [], hoverObject: null})
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
      const {selectedObjects} = this.state
      if (selectedObjects.length > 0) {
        this.commandManager.execute(new DeleteObjectsCommand(selectedObjects))
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

  handleObjectClick = (e:MouseEvent|React.MouseEvent<any>, obj:DrawingObject) => {
    if (this.currentTool && this.currentTool.handleObjectClick) {
      this.currentTool.handleObjectClick(e, obj)
    }
  }

  handleObjectHover = (e:MouseEvent|React.MouseEvent<any>, obj:DrawingObject, hovering: boolean) => {
    if (this.currentTool === this.tools.selection) {
      this.setState({hoverObject: hovering ? obj : null})
    }
  }

  handleSelectedObjectMouseDown = (e:React.MouseEvent<any>, obj:DrawingObject) => {
    let moved = false
    const {selectedObjects} = this.state
    const starting:Point = getWorkspacePoint(e)
    const start = selectedObjects.map((object) => {return {x: object.x, y: object.y}})

    e.preventDefault()
    e.stopPropagation()

    const handleMouseMove = (e:MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const current:Point = getWorkspacePoint(e)
      const dx = current.x - starting.x
      const dy = current.y - starting.y
      moved = moved || ((dx !== 0) && (dy !== 0))

      selectedObjects.forEach((object, index) => {
        object.x = start[index].x + dx
        object.y = start[index].y + dy
      })
      this.forceUpdate()
    }
    const handleMouseUp = (e:MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
      if (moved) {
        const end = selectedObjects.map((object) => {return {x: object.x, y: object.y}})
        this.commandManager.execute(new MoveObjectsCommand(selectedObjects, start, end))
      }
      else {
        this.handleObjectClick(e, obj)
      }
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
  }

  startSelectionBox(p:Point) {
    this.setState({selectionBox: new SelectionBox(p)})
  }

  updateSelectionBox(p:Point) {
    const {selectionBox} = this.state
    if (selectionBox) {
      selectionBox.update(p)
      this.setState({selectionBox})
    }
  }

  endSelectionBox(addToSelectedObjects:boolean) {
    const {selectionBox} = this.state
    if (selectionBox) {
      selectionBox.close()
      const selectedObjects:DrawingObject[] = addToSelectedObjects ? this.state.selectedObjects : []
      this.forEachObject((object) => {
        if (object.inSelection(selectionBox)) {
          if (selectedObjects.indexOf(object) === -1) {
            selectedObjects.push(object)
          }
        }
      })
      this.setState({selectionBox: null, selectedObjects})
    }
  }

  renderObject = (key:string) => {
    const object = this.state.objects[key]
    return object ? object.render({key, handleClick: this.handleObjectClick, handleHover: this.handleObjectHover, drawingLayer: this}) : null
  }

  renderSelectedObjects(selectedObjects:DrawingObject[], color:string) {
    return selectedObjects.map((object, index) => {
      const {nw, se} = object.getBoundingBox()
      return <rect
                key={index}
                x={nw.x}
                y={nw.y}
                width={se.x - nw.x}
                height={se.y - nw.y}
                fill={color}
                fillOpacity="0"
                stroke={color}
                strokeWidth="2"
                strokeDasharray="10 5"
                onMouseDown={(e) => this.handleSelectedObjectMouseDown(e, object)}
                onMouseEnter={(e) => this.handleObjectHover(e, object, true) }
                onMouseLeave={(e) => this.handleObjectHover(e, object, false) }
               />
    })
  }

  renderSVG() {
    const {svgWidth, svgHeight} = this.state
    const hoveringOverAlreadySelectedObject = this.state.hoverObject ? this.state.selectedObjects.indexOf(this.state.hoverObject) !== -1 : false
    return (
      <svg xmlnsXlink= "http://www.w3.org/1999/xlink" width={svgWidth} height={svgHeight}>
        {Object.keys(this.state.objects).map(this.renderObject)}
        {this.renderSelectedObjects(this.state.selectedObjects, SELECTION_COLOR)}
        {this.state.hoverObject ? this.renderSelectedObjects([this.state.hoverObject], hoveringOverAlreadySelectedObject ? SELECTION_COLOR : HOVER_COLOR) : null}
        {this.state.currentLine ? this.state.currentLine.render({key: "current"}) : null}
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