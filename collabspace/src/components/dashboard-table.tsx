import * as React from "react"
import * as firebase from "firebase"
import { PortalOffering, PortalUser } from "../lib/auth";

export interface DashboardTableComponentProps {
  portalUser: PortalUser
  portalOffering: PortalOffering
}

export interface DashboardTableComponentState {
}

export class DashboardTableComponent extends React.Component<DashboardTableComponentProps, DashboardTableComponentState> {

  constructor (props:DashboardTableComponentProps) {
    super(props);
    this.state = {
    }
  }

  render() {
    return (
      <div className="dashboard-table">Dashboard Table</div>
    )
  }
}

