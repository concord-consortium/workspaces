import * as React from "react"
import * as firebase from "firebase"
import * as queryString from "query-string"
import * as jwt from "jsonwebtoken"
import { PortalOffering } from "../lib/auth";
import { Document, FirebasePublication } from "../lib/document"

export interface DashboardDocumentComponentProps {
  portalOffering: PortalOffering
  document: Document
  firebasePublication: FirebasePublication
}

export interface DashboardDocumentComponentState {
}

export class DashboardDocumentComponent extends React.Component<DashboardDocumentComponentProps, DashboardDocumentComponentState> {

  constructor (props:DashboardDocumentComponentProps) {
    super(props);
    this.state = {
    }
  }
  render() {
    return (
      <div className="document">
        <div className="debug">{JSON.stringify(this.props, null, 2)}</div>
      </div>
    )
  }
}
