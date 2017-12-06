import * as React from "react"
import * as firebase from "firebase"

export interface DashboardComponentProps {
}

export interface DashboardComponentState {
}

export class DashboardComponent extends React.Component<DashboardComponentProps, DashboardComponentState> {
  infoRef: firebase.database.Reference

  constructor (props:DashboardComponentProps) {
    super(props);
    this.state = {
    }
  }

  render() {
    return (
      <div className="dashboard">
        DASHBOARD
      </div>
    )
  }
}
