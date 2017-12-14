import * as React from "react"
import { Document, FirebaseDocumentInfo } from "../lib/document"
import * as firebase from "firebase"
import { AppQueryParams, AppHashParams } from "./app"
import { DashboardQueryParams } from "./dashboard"
import * as queryString from "query-string"

const demoInfo = require("../../functions/demo-info").demoInfo;

export interface DemoComponentProps {
  firebaseUser: firebase.User
  template: Document
  demoId: string
}

export interface DemoComponentState {
  title: string|null
}

export class DemoComponent extends React.Component<DemoComponentProps, DemoComponentState> {
  infoRef: firebase.database.Reference

  constructor (props:DemoComponentProps) {
    super(props);
    this.state = {
      title: null
    }
  }

  componentWillMount() {
    this.infoRef = this.props.template.ref.child("info")
    this.infoRef.on("value", this.handleInfoRef)
  }

  componentWillUnmount() {
    this.infoRef.off("value", this.handleInfoRef)
  }

  handleInfoRef = (snapshot:firebase.database.DataSnapshot) => {
    const info:FirebaseDocumentInfo|null = snapshot.val()
    if (info) {
      this.setState({title: info.name})
    }
  }

  renderStudentLinks() {
    const links = []
    const hash = window.location.hash
    const templateParam = this.props.template.getTemplateHashParam()
    for (let i=0; i < demoInfo.numStudents; i++) {
      const userId = i + 1;
      const queryParams:AppQueryParams = {
        demo: this.props.demoId,
        token: userId,
        domain: demoInfo.rootUrl,
        domain_uid: userId
      }
      const hashParams:AppHashParams = {
        template: templateParam
      }
      const url = `?${queryString.stringify(queryParams)}#${queryString.stringify(hashParams)}`
      links.push(<div key={i}><a href={url} className="clickable" target="_blank">Student {userId}</a></div>)
    }
    return links
  }

  renderTeacherLinks() {
    const links = []
    const hash = window.location.hash
    const templateParam = this.props.template.getTemplateHashParam()
    for (let i=0; i < demoInfo.numTeachers; i++) {
      const userId = i + 1000;
      const queryParams:DashboardQueryParams = {
        demo: this.props.demoId,
        token: String(userId),
        offering: `${demoInfo.rootUrl}demoGetFakeOffering?demo=${this.props.demoId}`,
        domain: demoInfo.rootUrl
      }
      const url = `dashboard.html?${queryString.stringify(queryParams)}`
      links.push(<div key={i}><a href={url} className="clickable" target="_blank">Teacher {userId - 999}</a></div>)
    }
    return links
  }

  render() {
    return (
      <div className="demo">
        {this.state.title ? <h1>{this.state.title}</h1> : null}
        <h2>Demo Links</h2>
        {this.renderStudentLinks()}
        <br />
        {this.renderTeacherLinks()}
      </div>
    )
  }
}
