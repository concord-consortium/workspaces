import * as React from "react"
import * as firebase from "firebase"
import { PortalOffering, PortalUser, PortalTokens } from "../lib/auth"
import * as queryString from "query-string"

export interface LearningLogComponentProps {
  portalUser: PortalUser
  portalTokens: PortalTokens
  onClose: () => void
}

export interface LearningLogComponentState {
}

export class LearningLogComponent extends React.Component<LearningLogComponentProps, LearningLogComponentState> {

  constructor (props:LearningLogComponentProps) {
    super(props);
    this.state = {
    }
  }

  handleHideLearningLogButton = () => {
    this.props.onClose()
  }

  render() {
    return (
      <div className="learning-log">
        <div className="toolbar">
          <div className="buttons">
            <div className="right-buttons">
              <button type="button" onClick={this.handleHideLearningLogButton}><i className="icon icon-profile" /> Close Learning Log</button>
            </div>
          </div>
        </div>
        <div className="learning-log-workspace">
          Learning Log
        </div>
      </div>
    )
  }
}

