import * as React from "react"
import * as firebase from "firebase"
import * as queryString from "query-string"

export interface DashboardQueryParameters {
  demo?: string
  token?: string|number
  jwtToken?: string
  document?: string
  offering?: string
}

export interface DashboardComponentProps {
}

export interface DashboardComponentState {
  params: DashboardQueryParameters
}

export class DashboardComponent extends React.Component<DashboardComponentProps, DashboardComponentState> {
  infoRef: firebase.database.Reference

  constructor (props:DashboardComponentProps) {
    super(props);
    this.state = {
      params: {}
    }
  }

  componentWillMount() {
    const params:DashboardQueryParameters = queryString.parse(window.location.search)
    this.setState({params})
  }

  /*
    sample student open in dashboard: demo=AAA&document=XXX&domain=YYY&jwtToken=ZZZ
    sample teacher: demo=AAA&offering=BBB&token=CCC
    http://127.0.0.1:8080/dashboard.html?offering=http://localhost:9000/api/v1/offerings/1&token=369f82629a35fb9e367a2787e353c859&username=dougmartin

  */

  renderDebugInfo() {
    const {params} = this.state
    if (params.jwtToken) {
      return <div>Opening document {params.document} for student</div>
    }
    if (params.token) {
      return <div>Showing dashboard for teacher</div>
    }
    return <div>Unknown parameters!</div>
  }

  render() {
    return (
      <div className="dashboard">
        {this.renderDebugInfo()}
      </div>
    )
  }
}
