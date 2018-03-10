import * as React from "react"
import * as firebase from "firebase"
import * as CodeMirror from "codemirror"
import { EventEmitter, Events } from "../lib/events"
import { TOOLBAR_WIDTH, ImageButtonData, LineButtonData, PolygonButtonData, TextButtonData, ToolbarSettings, DefaultToolbarSettings } from "./toolbar"
import { v4 as uuid } from "uuid"

const SELECTION_COLOR = "#777"
const HOVER_COLOR = "#ccff00"
const SELECTION_BOX_PADDING = 10

// Firepad tries to require the node version of firebase if it isn't defined on the window and expects CodeMirror defined on window
const win = window as any
win.CodeMirror = CodeMirror
win.firebase = firebase
const Firepad = require("firepad/dist/firepad.js")

import "codemirror/lib/codemirror.css"
import "firepad/dist/firepad.css"
import { text } from "d3";

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

  overlaps(nw2:Point, se2:Point) {
    const {nw, se} = this
    return  ((nw.x < se2.x) && (se.x > nw2.x) && (nw.y < se2.y) && (se.y > nw2.y))
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
  readonly?: boolean
  firebaseRef: firebase.database.Reference
  events: EventEmitter
  imageSetItems: ImageSetItem[]
}

export interface DrawingLayerViewState {
  currentDrawingObject: LineObject|RectangleObject|EllipseObject|VectorObject|null
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
  drawingLayer: DrawingLayerView
}
export interface DrawingObject {
  type: string
  key: string|null
  x: number
  y: number
  serialize(): string
  update(json:any): void
  inSelection(selectionBox:SelectionBox): boolean
  getBoundingBox(): BoundingBox
  render(options:DrawingObjectOptions): JSX.Element | null
}

export interface Point {x: number, y: number}
export interface DeltaPoint {dx: number, dy: number}

export class LineObject implements DrawingObject {
  type: string
  key: string|null
  x: number
  y: number
  deltaPoints: DeltaPoint[]
  color: string
  strokeDashArray: string
  strokeWidth: string

  constructor (json?:any) {
    const {stroke, strokeDashArray, strokeWidth} = DefaultToolbarSettings
    this.type = "line"
    this.x = json ? (json.x || 0) : 0
    this.y = json ? (json.y || 0) : 0
    this.deltaPoints = json ? (json.deltaPoints || []) : []
    this.color = json ? (json.color || stroke) : stroke
    this.strokeDashArray = json ? (json.strokeDashArray || strokeDashArray) : strokeDashArray
    this.strokeWidth = json ? (json.strokeWidth || strokeWidth) : strokeWidth
  }

  serialize() {
    return JSON.stringify({
      type: this.type,
      color: this.color,
      strokeDashArray: this.strokeDashArray,
      strokeWidth: this.strokeWidth,
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
    this.strokeDashArray = json.strokeDashArray || this.strokeDashArray
    this.strokeWidth = json.strokeWidth || this.strokeWidth
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
              strokeWidth={this.strokeWidth}
              strokeDasharray={this.strokeDashArray}
              onClick={(e) => handleClick ? handleClick(e, this) : null}
              onMouseEnter={(e) => handleHover ? handleHover(e, this, true) : null }
              onMouseLeave={(e) => handleHover ? handleHover(e, this, false) : null }
             />
  }
}

export class VectorObject implements DrawingObject {
  type: string
  key: string|null
  x: number
  y: number
  x2: number
  y2: number
  stroke: string
  strokeDashArray: string
  strokeWidth: number

  constructor (json?:any) {
    const {stroke, fill, strokeDashArray, strokeWidth} = DefaultToolbarSettings
    this.type = "vector"
    this.x = json ? (json.x || 0) : 0
    this.y = json ? (json.y || 0) : 0
    this.x2 = json ? (json.x2 || 0) : 0
    this.y2 = json ? (json.y2 || 0) : 0
    this.stroke = json ? (json.stroke || stroke) : stroke
    this.strokeDashArray = json ? (json.strokeDashArray || strokeDashArray) : strokeDashArray
    this.strokeWidth = json ? (json.strokeWidth || strokeWidth) : strokeWidth
  }

  serialize() {
    return JSON.stringify({
      type: this.type,
      x: this.x,
      y: this.y,
      x2: this.x2,
      y2: this.y2,
      stroke: this.stroke,
      strokeDashArray: this.strokeDashArray,
      strokeWidth: this.strokeWidth
    })
  }

  update(json:any) {
    this.x = json.x1 || this.x
    this.y = json.y1 || this.y
    this.x2 = json.x2 || this.x2
    this.y2 = json.y2 || this.y2
    this.stroke = json.stroke || this.stroke
    this.strokeDashArray = json.strokeDashArray || this.strokeDashArray
    this.strokeWidth = json.strokeWidth || this.strokeWidth
  }

  inSelection(selectionBox:SelectionBox) {
    const {nw, se} = this.getBoundingBox()
    return selectionBox.overlaps(nw, se)
  }

  getBoundingBox() {
    const {x, y, x2, y2} = this
    const nw:Point = {x: Math.min(x, x2), y: Math.min(y, y2)}
    const se:Point = {x: Math.max(x, x2), y: Math.max(y, y2)}
    return {nw, se}
  }

  render(options:DrawingObjectOptions) : JSX.Element|null {
    const {key, handleClick, handleHover} = options
    return <line
              key={key}
              x1={this.x}
              y1={this.y}
              x2={this.x2}
              y2={this.y2}
              stroke={this.stroke}
              strokeWidth={this.strokeWidth}
              strokeDasharray={this.strokeDashArray}
              onClick={(e) => handleClick ? handleClick(e, this) : null }
              onMouseEnter={(e) => handleHover ? handleHover(e, this, true) : null }
              onMouseLeave={(e) => handleHover ? handleHover(e, this, false) : null }
             />
  }
}

export class RectangleObject implements DrawingObject {
  type: string
  key: string|null
  x: number
  y: number
  width: number
  height: number
  stroke: string
  fill: string
  strokeDashArray: string
  strokeWidth: number

  constructor (json?:any) {
    const {stroke, fill, strokeDashArray, strokeWidth} = DefaultToolbarSettings
    this.type = "rectangle"
    this.x = json ? (json.x || 0) : 0
    this.y = json ? (json.y || 0) : 0
    this.width = json ? (json.width || 0) : 0
    this.height = json ? (json.height || 0) : 0
    this.stroke = json ? (json.stroke || stroke) : stroke
    this.fill = json ? (json.fill || fill) : fill
    this.strokeDashArray = json ? (json.strokeDashArray || strokeDashArray) : strokeDashArray
    this.strokeWidth = json ? (json.strokeWidth || strokeWidth) : strokeWidth
  }

  serialize() {
    return JSON.stringify({
      type: this.type,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      stroke: this.stroke,
      fill: this.fill,
      strokeDashArray: this.strokeDashArray,
      strokeWidth: this.strokeWidth
    })
  }

  update(json:any) {
    this.x = json.x || this.x
    this.y = json.y || this.y
    this.width = json.width || this.width
    this.height = json.height || this.height
    this.stroke = json.stroke || this.stroke
    this.fill = json.fill || this.fill
    this.strokeDashArray = json.strokeDashArray || this.strokeDashArray
    this.strokeWidth = json.strokeWidth || this.strokeWidth
  }

  inSelection(selectionBox:SelectionBox) {
    const {nw, se} = this.getBoundingBox()
    return selectionBox.overlaps(nw, se)
  }

  getBoundingBox() {
    const {x, y, width, height} = this
    const nw:Point = {x, y}
    const se:Point = {x: x + width, y: y + height}
    return {nw, se}
  }

  render(options:DrawingObjectOptions) : JSX.Element|null {
    const {key, handleClick, handleHover} = options
    return <rect
              key={key}
              x={this.x}
              y={this.y}
              width={this.width}
              height={this.height}
              stroke={this.stroke}
              fill={this.fill}
              strokeWidth={this.strokeWidth}
              strokeDasharray={this.strokeDashArray}
              onClick={(e) => handleClick ? handleClick(e, this) : null }
              onMouseEnter={(e) => handleHover ? handleHover(e, this, true) : null }
              onMouseLeave={(e) => handleHover ? handleHover(e, this, false) : null }
             />
  }
}

export class EllipseObject implements DrawingObject {
  type: string
  key: string|null
  x: number
  y: number
  rx: number
  ry: number
  stroke: string
  fill: string
  strokeWidth: number
  strokeDashArray: string

  constructor (json?:any) {
    const {stroke, fill, strokeDashArray, strokeWidth} = DefaultToolbarSettings
    this.type = "ellipse"
    this.x = json ? (json.x || 0) : 0
    this.y = json ? (json.y || 0) : 0
    this.rx = json ? (json.rx || 0) : 0
    this.ry = json ? (json.ry || 0) : 0
    this.stroke = json ? (json.stroke || stroke) : stroke
    this.fill = json ? (json.fill || fill) : fill
    this.strokeDashArray = json ? (json.strokeDashArray || strokeDashArray) : strokeDashArray
    this.strokeWidth = json ? (json.strokeWidth || strokeWidth) : strokeWidth
  }

  serialize() {
    return JSON.stringify({
      type: this.type,
      x: this.x,
      y: this.y,
      rx: this.rx,
      ry: this.ry,
      stroke: this.stroke,
      fill: this.fill,
      strokeDashArray: this.strokeDashArray,
      strokeWidth: this.strokeWidth
    })
  }

  update(json:any) {
    this.x = json.x || this.x
    this.y = json.y || this.y
    this.rx = json.rx || this.rx
    this.ry = json.ry || this.ry
    this.stroke = json.stroke || this.stroke
    this.fill = json.fill || this.fill
    this.strokeDashArray = json.strokeDashArray || this.strokeDashArray
    this.strokeWidth = json.strokeWidth || this.strokeWidth
  }

  inSelection(selectionBox:SelectionBox) {
    const {nw, se} = this.getBoundingBox()
    return selectionBox.overlaps(nw, se)
  }

  getBoundingBox() {
    const {x, y, rx, ry} = this
    const nw:Point = {x: x - rx, y: y - ry}
    const se:Point = {x: x + rx, y: y + ry}
    return {nw, se}
  }

  render(options:DrawingObjectOptions) : JSX.Element|null {
    const {key, handleClick, handleHover} = options
    return <ellipse
              key={key}
              cx={this.x}
              cy={this.y}
              rx={this.rx}
              ry={this.ry}
              stroke={this.stroke}
              fill={this.fill}
              strokeWidth={this.strokeWidth}
              strokeDasharray={this.strokeDashArray}
              onClick={(e) => handleClick ? handleClick(e, this) : null}
              onMouseEnter={(e) => handleHover ? handleHover(e, this, true) : null }
              onMouseLeave={(e) => handleHover ? handleHover(e, this, false) : null }
             />
  }
}

export class ImageObject implements DrawingObject {
  type: string
  key: string|null
  x: number
  y: number
  imageSetItem: ImageSetItem

  constructor (json?:any) {
    this.type = "image"
    this.imageSetItem = json ? json.imageSetItem : {src: "", width: 0, height: 0, title: ""}
    this.x = json ? json.x : 0
    this.y = json ? json.y : 0
  }

  serialize() {
    return JSON.stringify({
      type: this.type,
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
    const {nw, se} = this.getBoundingBox()
    return selectionBox.overlaps(nw, se)
  }

  getBoundingBox() {
    const {x, y} = this
    const {width, height} = this.imageSetItem
    const nw:Point = {x, y}
    const se:Point = {x: x + width, y: y + height}
    return {nw, se}
  }

  render(options:DrawingObjectOptions) : JSX.Element|null {
    const {key, handleClick, handleHover, drawingLayer} = options
    const {imageSetItem} = this
    const src = drawingLayer && drawingLayer.state.imageDataUriCache[imageSetItem.src]
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

export class TextObject implements DrawingObject {
  type: string
  key: string|null
  x: number
  y: number
  width: number
  height: number
  color: string
  uuid: string
  fontSize: number
  fontWeight: string
  fontStyle: string

  constructor (json?:any) {
    const {stroke, fontSize, fontWeight, fontStyle} = DefaultToolbarSettings
    this.type = "text"
    this.x = json ? json.x : 0
    this.y = json ? json.y : 0
    this.width = json ? (json.width || 300) : 300
    this.color = json ? (json.color || stroke) : stroke
    this.uuid = json ? (json.uuid || uuid()) : uuid()
    this.fontSize = json ? json.fontSize : fontSize
    this.fontWeight = json ? json.fontWeight : fontWeight
    this.fontStyle = json ? json.fontStyle : fontStyle
  }

  serialize() {
    // NOTE: height is not serialized as it is calculated dynamically in the text editor view
    return JSON.stringify({
      type: this.type,
      x: this.x,
      y: this.y,
      width: this.width,
      color: this.color,
      uuid: this.uuid,
      fontSize: this.fontSize,
      fontWeight: this.fontWeight,
      fontStyle: this.fontStyle
    })
  }

  update(json:any) {
    this.x = json.x || this.x
    this.y = json.y || this.y
    this.width = json.width || this.width
    this.color = json.color || this.color
    this.uuid = json.uuid || this.uuid
    this.fontSize = json.fontSize || this.fontSize
    this.fontWeight = json.fontWeight || this.fontWeight
    this.fontStyle = json.fontStyle || this.fontStyle
  }

  inSelection(selectionBox:SelectionBox) {
    const {nw, se} = this.getBoundingBox()
    return selectionBox.overlaps(nw, se)
  }

  getBoundingBox() {
    const {x, y, width, height} = this
    const nw:Point = {x, y}
    const se:Point = {x: x + width, y: y + height}
    return {nw, se}
  }

  render(options:DrawingObjectOptions) : JSX.Element|null {
    const {key, handleHover, drawingLayer} = options
    const {x, y, width, height, color, uuid} = this

    return <TextEditorWrapperView
              key={key}
              textObject={this}
              onMouseEnter={(e) => handleHover ? handleHover(e, this, true) : null }
              onMouseLeave={(e) => handleHover ? handleHover(e, this, false) : null }
              drawingLayer={drawingLayer}
            />
  }
}

export interface TextEditorWrapperViewProps {
  textObject: TextObject
  onMouseEnter: ((e:any) => void)|undefined
  onMouseLeave: ((e:any) => void)|undefined
  drawingLayer: DrawingLayerView
}

export interface TextEditorWrapperViewState {
  width: number
  height: number
  resizing: boolean
}

export class TextEditorWrapperView extends React.Component<TextEditorWrapperViewProps, TextEditorWrapperViewState> {
  codeMirror: CodeMirror.EditorFromTextArea

  constructor(props:TextEditorWrapperViewProps){
    super(props)

    this.state = {
      width: this.props.textObject.width,
      height: 0, // this is updated dyanmically be the TextEditorView after the render
      resizing: false
    }
  }

  componentDidUpdate() {
    const {width} = this.props.textObject
    if (this.state.width !== width) {
      this.setState({width})
    }
    this.codeMirror.refresh()
  }

  handleSetDimensions = (width: number, height:number) => {
    if ((this.state.width !== width) || (this.state.height !== height)) {
      this.props.textObject.width = width
      this.props.textObject.height = height
      this.setState({width, height})
    }
  }

  handleSetCodeMirror = (codeMirror:CodeMirror.EditorFromTextArea) => {
    this.codeMirror = codeMirror
  }

  handleMouseDown = (e:React.MouseEvent<HTMLDivElement>) => {
    const {textObject, drawingLayer} = this.props
    if (drawingLayer.state.selectedObjects.indexOf(textObject) !== -1) {
      drawingLayer.handleSelectedObjectMouseDown(e, textObject)
    }
  }

  render() {
    const {textObject, onMouseEnter, onMouseLeave, drawingLayer} = this.props
    const {height, resizing} = this.state
    const {x, y, width} = textObject
    const enabled = !drawingLayer.currentTool || (drawingLayer.currentTool === drawingLayer.tools.text)
    const pointerEvents = enabled ? "all" : "none"
    const style = {left: x, top: y, width: width, height: height}
    return (
      <div className="text-editor-wrapper"
           style={style}
           onMouseDown={this.handleMouseDown}
           onMouseEnter={onMouseEnter}
           onMouseLeave={onMouseLeave}
      >
        <div style={{pointerEvents: pointerEvents}} >
          <TextEditorView textObject={textObject} drawingLayer={drawingLayer} enabled={enabled} setDimensions={this.handleSetDimensions} setCodeMirror={this.handleSetCodeMirror} resizing={resizing} />
        </div>
      </div>
    )
  }
}

export interface TextEditorViewProps {
  textObject: TextObject
  drawingLayer: DrawingLayerView
  resizing: boolean
  enabled: boolean
  setDimensions: (width:number, height:number) => void
  setCodeMirror: (codeMirror:CodeMirror.EditorFromTextArea) => void
}

export interface TextEditorViewState {
}

export class TextEditorView extends React.Component<TextEditorViewProps, TextEditorViewState> {
  editorRef: firebase.database.Reference
  firepad: any
  codeMirror: CodeMirror.EditorFromTextArea
  wrapperElement: HTMLElement
  sizer: HTMLElement

  constructor(props:TextEditorViewProps){
    super(props)

    this.state = {}

    // yeah, this is a little weird...
    this.editorRef = this.props.drawingLayer.props.firebaseRef.child("editor").child(this.props.textObject.uuid)
  }

  refs: {
    textEditor: HTMLTextAreaElement
  }

  styleWrapper(addBorder:boolean) {
    const {color, fontSize, fontWeight, fontStyle} = this.props.textObject
    const style = `color: ${color}; font-size: ${fontSize}px; font-weight: ${fontWeight}; font-style: ${fontStyle}; border: ${addBorder ? "1px solid #aaa; padding: 0;" : "none; padding: 1px;"};`
    this.wrapperElement.setAttribute("style", style)
  }

  handleFocused = () => {
    this.styleWrapper(true)
  }

  handleBlur = () => {
    this.styleWrapper(false)
  }

  handleMouseOver = () => {
    if (this.props.enabled && !this.props.resizing) {
      this.styleWrapper(true)
    }
  }

  handleMouseOut = () => {
    if (this.props.enabled && !this.props.resizing && !this.codeMirror.hasFocus()) {
      this.styleWrapper(false)
    }
  }

  updateHeight = () => {
    this.props.setDimensions(this.sizer.clientWidth, this.sizer.clientHeight)
  }

  componentDidMount() {
    const {textObject, drawingLayer} = this.props
    const {autoFocusTextObject} = drawingLayer
    const {readonly} = drawingLayer.props

    this.codeMirror = CodeMirror.fromTextArea(this.refs.textEditor, {
      scrollbarStyle: "null"
    })
    this.props.setCodeMirror(this.codeMirror)

    this.sizer = (this.codeMirror as any).display.sizer
    this.wrapperElement = this.codeMirror.getWrapperElement()
    this.styleWrapper(false)

    this.codeMirror.on("focus", this.handleFocused)
    this.codeMirror.on("blur", this.handleBlur)
    this.codeMirror.on("update", () => {
      this.updateHeight()
    })

    this.wrapperElement.addEventListener("mouseover", this.handleMouseOver)
    this.wrapperElement.addEventListener("mouseout", this.handleMouseOut)

    this.firepad = Firepad.fromCodeMirror(this.editorRef, this.codeMirror, { richTextToolbar: false, richTextShortcuts: false });

    this.updateHeight()

    if (autoFocusTextObject && (autoFocusTextObject.uuid === textObject.uuid)) {
      // keep focus for this one mount
      this.codeMirror.focus()
      drawingLayer.autoFocusTextObject = null
    }
    else {
      // remove focus (the color and fontSize calls above set focus)
      //this.codeMirror.getInputField().blur()
    }
  }

  componentWillUnmount() {
    this.firepad.dispose()
  }

  componentWillReceiveProps(nextProps:TextEditorViewProps) {
    if (nextProps.resizing !== this.props.resizing) {
      this.styleWrapper(nextProps.resizing)
    }
  }

  shouldComponentUpdate() {
    return false
  }

  render() {
    return (
      <div className="text-editor">
        <textarea ref="textEditor" />
      </div>
    )
  }
}

interface ObjectConstructorMap {
  [key: string]: (typeof LineObject)|(typeof VectorObject)|(typeof ImageObject)|(typeof RectangleObject)|(typeof EllipseObject)|(typeof TextObject)|null
}
const objectConstructors:ObjectConstructorMap = {
  "line": LineObject,
  "vector": VectorObject,
  "rectangle": RectangleObject,
  "ellipse": EllipseObject,
  "image": ImageObject,
  "text": TextObject
}

interface ObjectMap {
  [key: string]: DrawingObject|null
}

export interface DrawingToolMap {
  [key: string]: DrawingTool
}

export interface IDrawingTool {
  handleMouseDown?(e:React.MouseEvent<HTMLDivElement>): void
  handleClick?(e:React.MouseEvent<HTMLDivElement>): void
  handleObjectClick?(e:MouseEvent|React.MouseEvent<any>, obj:DrawingObject): void
  setSettings(settings:ToolbarSettings): IDrawingTool
}

export class DrawingTool implements IDrawingTool {
  drawingLayer: DrawingLayerView
  settings: ToolbarSettings

  constructor(drawingLayer:DrawingLayerView) {
    const {stroke, fill, strokeDashArray, strokeWidth, fontSize, fontStyle, fontWeight} = DefaultToolbarSettings
    this.drawingLayer = drawingLayer
    this.settings = {
      stroke,
      fill,
      strokeDashArray,
      strokeWidth,
      fontSize,
      fontStyle,
      fontWeight
    }
  }

  handleMouseDown(e:React.MouseEvent<HTMLDivElement>): void {
    // handled in subclass
  }

  handleClick(e:React.MouseEvent<HTMLDivElement>): void {
    // handled in subclass
  }

  handleObjectClick(e:MouseEvent|React.MouseEvent<any>, obj:DrawingObject): void   {
    // handled in subclass
  }

  setSettings(settings:ToolbarSettings) {
    this.settings = settings
    return this
  }
}

export class LineDrawingTool extends DrawingTool {

  constructor(drawingLayer:DrawingLayerView) {
    super(drawingLayer)
    this.drawingLayer = drawingLayer
  }

  handleMouseDown(e:React.MouseEvent<HTMLDivElement>) {
    e.preventDefault()
    const start = getWorkspacePoint(e)
    const {stroke, strokeWidth, strokeDashArray} = this.settings
    const line:LineObject = new LineObject({x: start.x, y: start.y, color: stroke, strokeWidth, strokeDashArray})

    let lastPoint = start
    const addPoint = (e:MouseEvent|React.MouseEvent<HTMLDivElement>) => {
      const p = getWorkspacePoint(e)
      if ((p.x >= 0) && (p.y >= 0)) {
        line.deltaPoints.push({dx: p.x - lastPoint.x, dy: p.y - lastPoint.y})
        lastPoint = p
        this.drawingLayer.setState({currentDrawingObject: line})
      }
    }

    const handleMouseMove = (e:MouseEvent) => {
      e.preventDefault()
      addPoint(e)
    }
    const handleMouseUp = (e:MouseEvent) => {
      e.preventDefault()
      if (line.deltaPoints.length > 0) {
        addPoint(e)
        this.drawingLayer.commandManager.execute(new ToggleObjectCommand(line))
      }
      this.drawingLayer.setState({currentDrawingObject: null})
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }

    this.drawingLayer.setState({currentDrawingObject: line})
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
  }
}

export class VectorDrawingTool extends DrawingTool {

  constructor(drawingLayer:DrawingLayerView) {
    super(drawingLayer)
  }

  handleMouseDown(e:React.MouseEvent<HTMLDivElement>) {
    e.preventDefault()
    const start = getWorkspacePoint(e)
    const {stroke, strokeWidth, strokeDashArray} = this.settings
    const vector:VectorObject = new VectorObject({x: start.x, y: start.y, x2: start.x, y2: start.y, stroke, strokeWidth, strokeDashArray})

    const handleMouseMove = (e:MouseEvent) => {
      e.preventDefault()
      const end = getWorkspacePoint(e)
      vector.x2 = end.x
      vector.y2 = end.y
      if (e.ctrlKey || e.altKey) {
        const dx = Math.abs(vector.x2 - vector.x)
        const dy = Math.abs(vector.y2 - vector.y)
        if (dx > dy) {
          vector.y2 = vector.y
        }
        else {
          vector.x2 = vector.x
        }
      }
      this.drawingLayer.setState({currentDrawingObject: vector})
    }
    const handleMouseUp = (e:MouseEvent) => {
      e.preventDefault()
      if ((vector.x !== vector.x2) || (vector.y !== vector.y2)) {
        this.drawingLayer.commandManager.execute(new ToggleObjectCommand(vector))
      }
      this.drawingLayer.setState({currentDrawingObject: null})
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }

    this.drawingLayer.setState({currentDrawingObject: vector})
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
  }
}

export class RectangleDrawingTool extends DrawingTool {

  constructor(drawingLayer:DrawingLayerView) {
    super(drawingLayer)
  }

  handleMouseDown(e:React.MouseEvent<HTMLDivElement>) {
    e.preventDefault()
    const start = getWorkspacePoint(e)
    const {stroke, fill, strokeWidth, strokeDashArray} = this.settings
    const rectangle:RectangleObject = new RectangleObject({x: start.x, y: start.y, width: 0, height: 0, stroke, fill, strokeWidth, strokeDashArray})

    const handleMouseMove = (e:MouseEvent) => {
      e.preventDefault()
      const end = getWorkspacePoint(e)
      rectangle.x = Math.min(start.x, end.x)
      rectangle.y = Math.min(start.y, end.y)
      rectangle.width = Math.max(start.x, end.x) - rectangle.x
      rectangle.height = Math.max(start.y, end.y) - rectangle.y
      if (e.ctrlKey || e.altKey) {
        let {x, y} = rectangle
        const {width, height} = rectangle
        const squareSize = Math.max(width, height)

        if (x === start.x) {
          if (y !== start.y) {
            y = start.y - squareSize
          }
        }
        else {
          x = start.x - squareSize
          if (y !== start.y) {
            y = start.y - squareSize
          }
        }

        rectangle.x = x
        rectangle.y = y
        rectangle.width = rectangle.height = squareSize
      }
      this.drawingLayer.setState({currentDrawingObject: rectangle})
    }
    const handleMouseUp = (e:MouseEvent) => {
      e.preventDefault()
      if ((rectangle.width > 0) && (rectangle.height > 0)) {
        this.drawingLayer.commandManager.execute(new ToggleObjectCommand(rectangle))
      }
      this.drawingLayer.setState({currentDrawingObject: null})
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }

    this.drawingLayer.setState({currentDrawingObject: rectangle})
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
  }
}

export class EllipseDrawingTool extends DrawingTool {

  constructor(drawingLayer:DrawingLayerView) {
    super(drawingLayer)
  }

  handleMouseDown(e:React.MouseEvent<HTMLDivElement>) {
    e.preventDefault()
    const start = getWorkspacePoint(e)
    const {stroke, fill, strokeWidth, strokeDashArray} = this.settings
    const ellipse:EllipseObject = new EllipseObject({x: start.x, y: start.y, rx: 0, ry: 0, stroke, fill, strokeWidth, strokeDashArray})

    const handleMouseMove = (e:MouseEvent) => {
      e.preventDefault()
      const end = getWorkspacePoint(e)
      ellipse.rx = Math.abs(start.x - end.x)
      ellipse.ry = Math.abs(start.y - end.y)
      if (e.ctrlKey || e.altKey) {
        ellipse.rx = ellipse.ry = Math.max(ellipse.rx, ellipse.ry)
      }
      this.drawingLayer.setState({currentDrawingObject: ellipse})
    }
    const handleMouseUp = (e:MouseEvent) => {
      e.preventDefault()
      if ((ellipse.rx > 0) && (ellipse.ry > 0)) {
        this.drawingLayer.commandManager.execute(new ToggleObjectCommand(ellipse))
      }
      this.drawingLayer.setState({currentDrawingObject: null})
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }

    this.drawingLayer.setState({currentDrawingObject: ellipse})
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
  }
}

export class SelectionDrawingTool extends DrawingTool {
  constructor(drawingLayer:DrawingLayerView) {
    super(drawingLayer)
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

export class ImageDrawingTool extends DrawingTool {
  imageSetItem: ImageSetItem

  constructor(drawingLayer:DrawingLayerView) {
    super(drawingLayer)
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

export class TextDrawingTool extends DrawingTool {

  constructor(drawingLayer:DrawingLayerView) {
    super(drawingLayer)
  }

  handleClick(e:React.MouseEvent<HTMLDivElement>) {
    // ignore clicks over existing text editors
    let node:HTMLElement|null = e.target as HTMLElement
    while (node) {
      if (node.className === "text-editor") {
        return
      }
      node = node.parentElement
    }

    const p = getWorkspacePoint(e)
    const {fontSize, fontWeight, fontStyle} = this.settings
    const text:TextObject = new TextObject({x: p.x, y: p.y - 26 /* to move it above cursor */, color: this.settings.stroke, fontSize, fontWeight, fontStyle, focused: true})
    this.drawingLayer.autoFocusTextObject = text
    this.drawingLayer.commandManager.execute(new ToggleObjectCommand(text))
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
  autoFocusTextObject: TextObject|null

  constructor(props:DrawingLayerViewProps){
    super(props)

    this.state = {
      currentDrawingObject: null,
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
      vector: new VectorDrawingTool(this),
      selection: new SelectionDrawingTool(this),
      image: new ImageDrawingTool(this),
      rectangle: new RectangleDrawingTool(this),
      ellipse: new EllipseDrawingTool(this),
      text: new TextDrawingTool(this)
    }
    this.currentTool = this.tools.selection

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
      if (!this.props.readonly) {
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
    this.props.events.listen(Events.SettingsChanged, (settings:ToolbarSettings) => this.setCurrentToolSettings(settings) )
    this.props.events.listen(Events.TextToolSelected, (data:ToolbarSettings) => this.setCurrentTool((this.tools.text as TextDrawingTool).setSettings(data)))
    this.props.events.listen(Events.LineDrawingToolSelected, (data:ToolbarSettings) => this.setCurrentTool((this.tools.line as LineDrawingTool).setSettings(data)))
    this.props.events.listen(Events.VectorToolSelected, (data:ToolbarSettings) => this.setCurrentTool((this.tools.vector as VectorDrawingTool).setSettings(data)))
    this.props.events.listen(Events.SelectionToolSelected, () => this.setCurrentTool(this.tools.selection))
    this.props.events.listen(Events.ImageToolSelected, (data:ImageButtonData) => this.setCurrentTool((this.tools.image as ImageDrawingTool).setImageSetItem(data.imageSetItem)))

    this.props.events.listen(Events.RectangleToolSelected, (data:ToolbarSettings) => this.setCurrentTool((this.tools.rectangle as RectangleDrawingTool).setSettings(data)))
    this.props.events.listen(Events.EllipseToolSelected, (data:ToolbarSettings) => this.setCurrentTool((this.tools.ellipse as EllipseDrawingTool).setSettings(data)))

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

  setCurrentToolSettings(settings:ToolbarSettings) {
    if (this.currentTool) {
      this.currentTool.setSettings(settings)
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
    const {selectedObjects} = this.state
    if (selectedObjects.length > 0) {
      this.commandManager.execute(new DeleteObjectsCommand(selectedObjects))
    }
  }

  handleMouseDown = (e:React.MouseEvent<HTMLDivElement>) => {
    if (this.currentTool) {
      this.currentTool.handleMouseDown(e)
    }
  }

  handleClick = (e:React.MouseEvent<HTMLDivElement>) => {
    if (this.currentTool) {
      this.currentTool.handleClick(e)
    }
  }

  handleObjectClick = (e:MouseEvent|React.MouseEvent<any>, obj:DrawingObject) => {
    if (this.currentTool) {
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

  renderObjects(filter:(object:DrawingObject) => boolean) {
    return Object.keys(this.state.objects).map((key) => {
      const object = this.state.objects[key]
      if (!object || !filter(object)) {
        return null
      }
      return object.render({key, handleClick: this.handleObjectClick, handleHover: this.handleObjectHover, drawingLayer: this})
    })
  }

  renderSelectedObjects(selectedObjects:DrawingObject[], color:string) {
    return selectedObjects.map((object, index) => {
      const {nw, se} = object.getBoundingBox()
      nw.x -= SELECTION_BOX_PADDING
      nw.y -= SELECTION_BOX_PADDING
      se.x += SELECTION_BOX_PADDING
      se.y += SELECTION_BOX_PADDING
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
        {this.renderObjects((object) => object.type !== "text")}
        {this.renderSelectedObjects(this.state.selectedObjects, SELECTION_COLOR)}
        {this.state.hoverObject ? this.renderSelectedObjects([this.state.hoverObject], hoveringOverAlreadySelectedObject ? SELECTION_COLOR : HOVER_COLOR) : null}
        {this.state.currentDrawingObject ? this.state.currentDrawingObject.render({key: "current", drawingLayer: this}) : null}
        {this.state.selectionBox ? this.state.selectionBox.render() : null}
      </svg>
    )
  }

  render() {
    return (
      <div className="drawing-layer" onMouseDown={this.handleMouseDown} onClick={this.handleClick}>
        {this.renderSVG()}
        {this.renderObjects((object) => object.type === "text")}
      </div>
    )
  }
}