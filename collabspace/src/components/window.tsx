import * as React from "react"
import * as firebase from "firebase"
import { InlineEditorComponent } from "./inline-editor"
import { Window, FirebaseWindowAttrs } from "../lib/window"
import { WindowManager, DragType } from "../lib/window-manager"

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
}
export interface WindowComponentState {
  editingTitle: boolean
  attrs: FirebaseWindowAttrs
}

export class WindowComponent extends React.Component<WindowComponentProps, WindowComponentState> {
  constructor (props:WindowComponentProps) {
    super(props)
    this.state = {
      editingTitle: false,
      attrs: props.window.attrs
    }
  }

  refs: {
    buttons: HTMLDivElement
  }

  componentWillMount() {
    this.props.window.onAttrsChanged = this.handleAttrsChanged
  }

  componentWillUnmount() {
    this.props.window.onAttrsChanged = null
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
    this.props.windowManager.windowLoaded(this.props.window, iframe)
  }

  handleCreatePublicCopy = (e:React.MouseEvent<HTMLSpanElement>) => {
    this.props.windowManager.createPublicCopy(this.props.window)
  }

  handlePublishWindow = () => {
    this.props.publishWindow(this.props.window)
  }

  handleCopyWindow = () => {

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
        {this.props.isTemplate ? <span onClick={this.handleClose} title="Close Window">x</span> : null}
      </div>
    )
  }

  renderReadonlyBlocker() {
    if (this.props.isReadonly) {
      return <div className="readonly-iframe-blocker" />
    }
    return null
  }

  renderOwnerBar(isTopWindow: boolean) {
    const className = `ownerbar${isTopWindow ? " top" : ""}`
    return (
      <div className={className}>
        <div className="info">
          <div className="inner-info">
            This is a private window, visible only to you.
          </div>
        </div>
        <div className="links">
          <span className="clickable" onClick={this.handleCreatePublicCopy}>Create Public Copy</span>
        </div>
      </div>
    )
  }

  renderSidebarMenu(left: number) {
    return (
      <div className="sidebar-menu" style={{left}}>
        <div className="sidebar-menu-inner">
          <i className="icon icon-newspaper" title="Publish Window" onClick={this.handlePublishWindow} />
          <i className="icon icon-copy" title="Copy Window" onClick={this.handleCopyWindow} />
        </div>
      </div>
    )
  }

  render() {
    const {window, isTopWindow, isTemplate} = this.props
    const {attrs} = window
    const {title, maximized, minimized, url} = attrs
    const titlebarClass = `titlebar${isTopWindow ? " top" : ""}`
    let windowStyle:any = maximized
      ? {top: 0, right: 0, bottom: 0, left: 0, zIndex: this.props.zIndex}
      : {top: attrs.top, width: attrs.width, left: attrs.left, height: attrs.height, zIndex: this.props.zIndex}
    const titleWidth = attrs.width - (this.props.isTemplate ? 65 : 55)
    const privateWindow = !!attrs.ownerId
    const iframeTop = privateWindow ? 44 : 22;

    if (minimized) {
      windowStyle.display = "none"
    }

    return (
      <div className="window" ref="window" key={window.id} style={windowStyle}>
        <div className={titlebarClass} onMouseDown={this.handleDragWindow}>
          <div className="title" style={{width: titleWidth}}>
            {this.props.isTemplate ? <InlineEditorComponent text={title} changeText={this.handleChangeTitle} width={titleWidth} /> : <div className="static">{title}</div>}
          </div>
          {this.renderButtons()}
        </div>
        { privateWindow ? this.renderOwnerBar(isTopWindow) : null}
        <div className="iframe" style={{top: iframeTop}}>
          <WindowIframeComponent key={window.id} src={url} loaded={this.handleIframeLoaded} />
          {this.renderReadonlyBlocker()}
        </div>
        {this.renderIframeOverlay()}
        {!maximized ? <div className="left-drag" onMouseDown={this.handleDragLeft} /> : null}
        {!maximized ? <div className="right-drag" onMouseDown={this.handleDragRight} /> : null}
        {!maximized ? <div className="top-drag" onMouseDown={this.handleDragTop} /> : null}
        {!maximized ? <div className="bottom-drag" onMouseDown={this.handleDragBottom} /> : null}
        {!maximized ? <div className="bottom-left-drag" onMouseDown={this.handleDragBottomLeft} /> : null}
        {!maximized ? <div className="bottom-right-drag" onMouseDown={this.handleDragBottomRight} /> : null}
        {isTopWindow && !maximized && !isTemplate ? this.renderSidebarMenu(windowStyle.width + 4) : null}
      </div>
    )
  }
}