import * as React from "react"
import * as firebase from "firebase"
import { InlineEditorComponent } from "./inline-editor"
import { Window, FirebaseWindowAttrs, FirebaseAnnotationMap, Annotation, PathAnnotation, PathAnnotationPoint } from "../lib/window"
import { WindowManager, DragType } from "../lib/window-manager"
import { v4 as uuidV4 } from "uuid"
import { PortalUser } from "../lib/auth";
import * as html2canvas from "html2canvas"

export const TITLEBAR_HEIGHT = 22

export type CaptureAnnotationCallback = (err: null, imageDataUrl: string|null) => void

export interface CaptureAnnotationCallbackMap {
  [key: string]: CaptureAnnotationCallback
}

export type AnnotationTool = "draw"

export interface WindowIframeComponentProps {
  src: string | undefined
  loaded: (iframe:HTMLIFrameElement) => void
}

export interface WindowIframeComponentState {
}

export class WindowIframeComponent extends React.Component<WindowIframeComponentProps, WindowIframeComponentState> {
  firstLoad: boolean

  constructor (props:WindowIframeComponentProps) {
    super(props);
    this.state = {}
    this.firstLoad = true
  }

  refs: {
    iframe: HTMLIFrameElement
  }

  handleLoaded = () => {
    if (this.firstLoad) {
      this.props.loaded(this.refs.iframe)
      this.firstLoad = false
    }
  }

  shouldComponentUpdate() {
    return false
  }

  render() {
    return <iframe ref='iframe' src={this.props.src} onLoad={this.handleLoaded}></iframe>
  }
}

export interface WindowComponentProps {
  window: Window
  windowManager: WindowManager
  isTopWindow: boolean
  zIndex: number
  isTemplate: boolean
  isReadonly: boolean
  publishWindow: (window:Window|null) => void
  copyWindow: (window:Window) => void
  snapshotWindow: (window:Window) => void
  annotationsRef: firebase.database.Reference
  portalUser: PortalUser|null
  captureAnnotationsCallback?: CaptureAnnotationCallback|null
}
export interface WindowComponentState {
  editingTitle: boolean
  attrs: FirebaseWindowAttrs
  inited: boolean
  annotating: boolean
  annotationTool: AnnotationTool
  annotationSVGWidth: number|string
  annotationSVGHeight: number|string
  annontations: FirebaseAnnotationMap,
  currentAnnotation: Annotation|null
}

export class WindowComponent extends React.Component<WindowComponentProps, WindowComponentState> {
  annotationsElement: HTMLDivElement|null

  constructor (props:WindowComponentProps) {
    super(props)
    this.state = {
      editingTitle: false,
      attrs: props.window.attrs,
      inited: false,
      annotating: false,
      annotationTool: "draw",
      annotationSVGWidth: "100%",
      annotationSVGHeight: "100%",
      annontations: {},
      currentAnnotation: null
    }
  }

  refs: {
    buttons: HTMLDivElement
  }

  componentWillMount() {
    const {annotationsRef} = this.props

    this.props.window.onAttrsChanged = this.handleAttrsChanged
    window.addEventListener("resize", this.setSVGSize)
    this.setSVGSize()

    annotationsRef.on("child_added", this.handleAnnotationChildAdded)
    annotationsRef.on("child_removed", this.handleAnnotationChildRemoved)
  }

  componentWillUnmount() {
    const {annotationsRef} = this.props

    this.props.window.onAttrsChanged = null
    window.removeEventListener("resize", this.setSVGSize)

    annotationsRef.off("child_added", this.handleAnnotationChildAdded)
    annotationsRef.off("child_removed", this.handleAnnotationChildRemoved)
  }

  componentWillReceiveProps(nextProps:WindowComponentProps) {
    if (nextProps.captureAnnotationsCallback && (nextProps.captureAnnotationsCallback !== this.props.captureAnnotationsCallback)) {
      this.captureAnnotations(nextProps.captureAnnotationsCallback)
    }
  }

  captureAnnotations(callback:Function) {
    const {annotationsElement} = this
    if (annotationsElement) {
      html2canvas(annotationsElement, {backgroundColor: null} as any)
      .then((canvas) => {
        callback(null, canvas.toDataURL("image/png"))
      })
      .catch((e) => {
        callback(e)
      })
    }
    else {
      callback(null, null)
    }
  }

  setSVGSize = () => {
    this.setState({annotationSVGWidth: window.innerWidth, annotationSVGHeight: window.innerHeight - TITLEBAR_HEIGHT})
  }

  handleAnnotationChildAdded = (snapshot:firebase.database.DataSnapshot) => {
    const {portalUser} = this.props
    const annotation:Annotation|null = snapshot.val()
    if (annotation && snapshot.key && portalUser && (!annotation.userId || (annotation.userId === portalUser.id))) {
      const {annontations} = this.state
      annontations[snapshot.key] = annotation
      this.setState({annontations})
    }
  }

  handleAnnotationChildRemoved = (snapshot:firebase.database.DataSnapshot) => {
    const {portalUser} = this.props
    const annotation:Annotation|null = snapshot.val()
    if (annotation && snapshot.key && portalUser && (!annotation.userId || (annotation.userId === portalUser.id))) {
      const {annontations} = this.state
      delete annontations[snapshot.key]
      this.setState({annontations})
    }
  }

  handleAttrsChanged = (newAttrs:FirebaseWindowAttrs) => {
    this.setState({attrs: newAttrs})
  }

  handleMoveWindowToTop = () => {
    this.props.windowManager.moveToTop(this.props.window)
  }

  handleDragWindow = (e:React.MouseEvent<HTMLDivElement>) => {
    if (this.props.window.attrs.maximized) {
      return
    }

    // ignore button clicks (this down handler gets called before the button click handler)
    const parentElement = (e.target as any).parentElement
    if (parentElement && (parentElement === this.refs.buttons)) {
      return
    }

    if (!this.props.isTopWindow) {
      this.props.windowManager.moveToTop(this.props.window)
    }
    this.props.windowManager.registerDragWindow(this.props.window, DragType.Position)
  }

  handleDragLeft = (e:React.MouseEvent<HTMLDivElement>) => {
    this.props.windowManager.registerDragWindow(this.props.window, DragType.GrowLeft)
  }

  handleDragRight = (e:React.MouseEvent<HTMLDivElement>) => {
    this.props.windowManager.registerDragWindow(this.props.window, DragType.GrowRight)
  }

  handleDragTop = (e:React.MouseEvent<HTMLDivElement>) => {
    this.props.windowManager.registerDragWindow(this.props.window, DragType.GrowUp)
  }

  handleDragBottom = (e:React.MouseEvent<HTMLDivElement>) => {
    this.props.windowManager.registerDragWindow(this.props.window, DragType.GrowDown)
  }

  handleDragBottomLeft = (e:React.MouseEvent<HTMLDivElement>) => {
    this.props.windowManager.registerDragWindow(this.props.window, DragType.GrowDownLeft)
  }

  handleDragBottomRight = (e:React.MouseEvent<HTMLDivElement>) => {
    this.props.windowManager.registerDragWindow(this.props.window, DragType.GrowDownRight)
  }

  handleMinimize = (e:React.MouseEvent<HTMLSpanElement>) => {
    this.props.windowManager.setState(this.props.window, true, !!this.props.window.attrs.maximized)
  }

  handleMaximize = (e:React.MouseEvent<HTMLSpanElement>) => {
    this.props.windowManager.setState(this.props.window, false, !this.props.window.attrs.maximized)
  }

  handleClose = (e:React.MouseEvent<HTMLSpanElement>) => {
    if (e.ctrlKey || confirm("Are you sure you want to close the window?")) {
      this.props.windowManager.close(this.props.window)
    }
  }

  handleChangeTitle = (newTitle: string) => {
    this.props.windowManager.changeTitle(this.props.window, newTitle)
  }

  handleIframeLoaded = (iframe:HTMLIFrameElement) => {
    const {window} = this.props
    this.props.windowManager.windowLoaded(window, iframe, () => {
      this.setState({inited: window.iframe.inited})
    })
  }

  handlePublishWindow = () => {
    this.props.publishWindow(this.props.window)
  }

  handleCopyWindow = () => {
    this.props.copyWindow(this.props.window)
  }

  handleSnapshotWindow = () => {
    this.props.snapshotWindow(this.props.window)
  }

  handleToggleAnnotateWindow = () => {
    this.setState({annotating: !this.state.annotating})
  }

  handleDrawAnnotations = () => {
    this.setState({annotationTool: "draw"})
  }

  handleClearAnnotations = () => {
    if (confirm("Are you sure you want to clear the annotations in this window?")) {
      const {portalUser} = this.props
      if (portalUser) {
        const {annontations} = this.state
        const updates:any = {}
        Object.keys(annontations).forEach((key) => {
          const annotation = annontations[key]
          if (annotation.userId === portalUser.id) {
            updates[key] = null
            delete annontations[key]
          }
        })
        this.setState({annontations: annontations}, () => this.props.annotationsRef.update(updates))
      }
    }
  }

  handleAnnotationMouseDown = (e:React.MouseEvent<HTMLDivElement>) => {
    const {annotationTool, attrs} = this.state
    const {portalUser} = this.props
    const {annotationsElement} = this

    if (!annotationsElement || !portalUser) {
      return
    }
    const boundingRect = annotationsElement.getBoundingClientRect()

    switch (annotationTool) {
      case "draw":
        const annotation:Annotation = {type: "path", id: uuidV4(), userId: portalUser.id, points: []}
        const getPoint = (e:React.MouseEvent<HTMLDivElement>|MouseEvent) => {
          return {x: e.clientX - boundingRect.left, y: e.clientY - boundingRect.top}
        }
        const startPoint:PathAnnotationPoint = getPoint(e)
        const handleDrawMove = (e:MouseEvent) => {
          if (annotation.points.length === 0) {
            annotation.points.push(startPoint)
          }
          annotation.points.push(getPoint(e))
          this.setState({currentAnnotation: annotation})
        }
        const handleDrawDone = (e:MouseEvent) => {
          this.props.annotationsRef.push(annotation)
          this.setState({currentAnnotation: null})

          window.removeEventListener("mousemove", handleDrawMove)
          window.removeEventListener("mouseup", handleDrawDone)
        }
        window.addEventListener("mousemove", handleDrawMove)
        window.addEventListener("mouseup", handleDrawDone)
        break
    }
  }

  canClose() {
    return this.props.isTemplate || !!this.props.window.attrs.ownerId
  }

  renderIframeOverlay() {
    if (this.props.isTopWindow) {
      return null
    }
    return <div className="iframe-overlay" onClick={this.handleMoveWindowToTop}></div>
  }

  renderButtons() {
    return (
      <div className="buttons" ref="buttons">
        <span onClick={this.handleMinimize} title="Minimize Window">-</span>
        <span onClick={this.handleMaximize} title={this.props.window.attrs.maximized ? "Unmaximize Window" : "Maximize Window"}>+</span>
        {this.canClose() ? <span onClick={this.handleClose} title="Close Window">x</span> : null}
      </div>
    )
  }

  renderReadonlyBlocker() {
    if (this.props.isReadonly) {
      return <div className="readonly-iframe-blocker" />
    }
    return null
  }

  renderAnnotationTools() {
    const {annotating, annotationTool, annontations} = this.state
    if (!annotating) {
      return null
    }
    const hasAnnotations = Object.keys(annontations).length > 0
    return (
      <div className="annotation-tools">
        <i key="pencil" className={`icon icon-pencil ${annotationTool === "draw" ? "annotation-tool-selected" : ""}`} title="Draw Annotations" onClick={this.handleDrawAnnotations} />
        <i key="pointer" className={`icon icon-cross ${!hasAnnotations ? "annotation-tool-disabled" : ""}`} title="Clear Annotations" onClick={this.handleClearAnnotations} />
      </div>
    )
  }

  renderSidebarMenu(left: number) {
    const {annotating, inited} = this.state
    return (
      <div className="sidebar-menu" style={{left}}>
        <div className="sidebar-menu-inner">
          {inited ? <i className="icon icon-newspaper" title="Publish Window" onClick={this.handlePublishWindow} /> : null}
          {inited ? <i className="icon icon-copy" title="Copy Window" onClick={this.handleCopyWindow} /> : null}
          <i className={`icon icon-stack ${annotating ? "annotation-tool-selected" : ""}`} title="Annotate Window" onClick={this.handleToggleAnnotateWindow} />
          {this.renderAnnotationTools()}
          {inited ? <i className="icon icon-camera" title="Take Snapshot" onClick={this.handleSnapshotWindow} /> : null}
        </div>
      </div>
    )
  }

  renderAnnotation(annotation:Annotation) {
    switch (annotation.type) {
      case "path":
        const [first, ...rest] = annotation.points
        const d = `M${first.x} ${first.y} ${rest.map((p) => `L${p.x} ${p.y}`).join(" ")}`
        return <path key={annotation.id} d={d} stroke="#f00" strokeWidth="2" fill="none" />
    }
    return null
  }

  renderAnnotations() {
    const {annotationSVGWidth, annotationSVGHeight, annontations, currentAnnotation} = this.state
    const pointerEvents = this.state.annotating ? "all" : "none"
    const currentAnnotationElement = currentAnnotation ? this.renderAnnotation(currentAnnotation) : null
    const annotationElements = Object.keys(annontations).map<JSX.Element|null>((key) => this.renderAnnotation(annontations[key]))
    return (
      <div className="annotations" ref={(el) => this.annotationsElement = el} style={{pointerEvents: pointerEvents}} onMouseDown={this.handleAnnotationMouseDown}>
        <svg xmlnsXlink= "http://www.w3.org/1999/xlink" width={annotationSVGWidth} height={annotationSVGHeight}>
          {annotationElements}
          {currentAnnotationElement}
        </svg>
      </div>
    )
  }

  render() {
    const {window, isTopWindow, isTemplate, isReadonly} = this.props
    const {attrs} = window
    const {title, maximized, minimized, url} = attrs
    const titlebarClass = `titlebar${isTopWindow ? " top" : ""}`
    let windowStyle:any = maximized
      ? {top: 0, right: 0, bottom: 0, left: 0, zIndex: this.props.zIndex}
      : {top: attrs.top, width: attrs.width, left: attrs.left, height: attrs.height, zIndex: this.props.zIndex}
    const titleWidth = attrs.width - (this.canClose() ? 65 : 55)
    const privateWindow = !!attrs.ownerId

    if (minimized) {
      windowStyle.display = "none"
    }

    return (
      <div className="window" ref="window" key={window.id} style={windowStyle}>
        <div className={titlebarClass} onMouseDown={this.handleDragWindow}>
          <div className="title" style={{width: titleWidth}}>
            <InlineEditorComponent text={title} changeText={this.handleChangeTitle} width={titleWidth} />
            { privateWindow ? " [PRIVATE]" : null}
          </div>
          {this.renderButtons()}
        </div>

        <div className="iframe">
          <WindowIframeComponent key={window.id} src={url} loaded={this.handleIframeLoaded} />
          {this.renderReadonlyBlocker()}
        </div>
        {this.renderAnnotations()}
        {this.renderIframeOverlay()}
        {!maximized ? <div className="left-drag" onMouseDown={this.handleDragLeft} /> : null}
        {!maximized ? <div className="right-drag" onMouseDown={this.handleDragRight} /> : null}
        {!maximized ? <div className="top-drag" onMouseDown={this.handleDragTop} /> : null}
        {!maximized ? <div className="bottom-drag" onMouseDown={this.handleDragBottom} /> : null}
        {!maximized ? <div className="bottom-left-drag" onMouseDown={this.handleDragBottomLeft} /> : null}
        {!maximized ? <div className="bottom-right-drag" onMouseDown={this.handleDragBottomRight} /> : null}
        {isTopWindow && !maximized && !isTemplate && !isReadonly ? this.renderSidebarMenu(windowStyle.width + 1) : null}
      </div>
    )
  }
}