import * as React from "react"
import * as firebase from "firebase"
import { Window } from "../lib/window"
import { WindowManager } from "../lib/window-manager"

export interface MinimizedWindowComponentProps {
  window: Window
  windowManager: WindowManager
}
export interface MinimizedWindowComponentState {
}

export class MinimizedWindowComponent extends React.Component<MinimizedWindowComponentProps, MinimizedWindowComponentState> {
  windowRef: firebase.database.Reference

  constructor (props:MinimizedWindowComponentProps) {
    super(props)
    this.state = {}
    this.handleClick = this.handleClick.bind(this)
  }

  handleClick() {
    this.props.windowManager.restoreMinimized(this.props.window)
  }

  render() {
    return (
      <div className="minimized-window" onClick={this.handleClick}>
        <div className="mini-window">
          <div className="titlebar"></div>
          <div className="iframe"></div>
        </div>
        <div className="title">{this.props.window.attrs.title}</div>
      </div>
    )
  }
}