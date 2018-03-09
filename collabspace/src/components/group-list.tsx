import * as React from "react"
import * as firebase from "firebase"
import { PortalOffering, PortalUser, AuthQueryParams, PortalTokens } from "../lib/auth"
import { getOfferingRef } from "../lib/refs"
import { FirebaseOfferingGroupMap, FirebaseOfferingGroup, Document, FirebaseOfferingTemplate } from "../lib/document"
import { UserLookup } from "../lib/user-lookup"
import * as queryString from "query-string"

export interface GroupListComponentProps {
  firebaseUser: firebase.User
  portalUser: PortalUser
  portalOffering: PortalOffering
  portalTokens: PortalTokens
}

export interface GroupListComponentState {
  groups: FirebaseOfferingGroupMap|null
  template:FirebaseOfferingTemplate|null
  loadingGroups: boolean
}

export class GroupListComponent extends React.Component<GroupListComponentProps, GroupListComponentState> {
  userLookup: UserLookup
  groupsRef: firebase.database.Reference
  templateRef: firebase.database.Reference

  constructor (props:GroupListComponentProps) {
    super(props);
    this.state = {
      groups: null,
      template: null,
      loadingGroups: true
    }

    this.userLookup = new UserLookup(this.props.portalOffering.classInfo)
  }

  componentWillMount() {
    this.groupsRef = getOfferingRef(this.props.portalOffering).child("groups")
    this.groupsRef.on("value", this.handleGroupsRef)
    this.templateRef = getOfferingRef(this.props.portalOffering).child("template")
    this.templateRef.on("value", this.handleTemplateRef)
  }

  componentWillUnmount() {
    this.groupsRef.off("value", this.handleGroupsRef)
  }

  handleGroupsRef = (snapshot:firebase.database.DataSnapshot) => {
    const groups:FirebaseOfferingGroupMap|null = snapshot.val()
    this.setState({groups, loadingGroups: false})
  }

  handleTemplateRef = (snapshot:firebase.database.DataSnapshot) => {
    const template:FirebaseOfferingTemplate|null = snapshot.val()
    this.setState({template})
  }

  renderUsers(group: FirebaseOfferingGroup) {
    const users:string[] = []
    Object.keys(group.users || {}).forEach((userId) => {
      const user = group.users[userId]
      const userInfo = this.userLookup.lookup(userId)
      if (userInfo) {
        users.push(`${userInfo.fullName}${user.connected ? "" : " (disconnected)"}`)
      }
    })
    return users.join(", ")
  }

  render() {
    const {template} = this.state
    const groups = this.state.groups || {}
    const groupKeys = Object.keys(groups)

    if (this.state.loadingGroups) {
      return <div className="progress">Getting group information...</div>
    }

    if ((groupKeys.length === 0) || !template) {
      return (
        <div className="group-table">
          <div className="no-rows">No groups have been created yet for this class</div>
        </div>
      )
    }

    return (
      <div className="group-table">
        <table>
          <thead>
            <tr>
              <th>Group</th>
              <th>Students</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {groupKeys.map((groupKey) => {
              const group = groups[parseInt(groupKey)]
              const {classInfoUrl, id} = this.props.portalOffering
              const existingParams:AuthQueryParams = queryString.parse(window.location.search)

              const params:AuthQueryParams = {
                portalJWT: this.props.portalTokens.rawPortalJWT,
                classInfoUrl,
                offeringId: id,
                group: groupKey,
                demo: existingParams.demo
              }
              const hashParams = {
                template:  Document.StringifyTemplateHashParam(template.userId, template.templateId)
              }
              const href = `index.html?${queryString.stringify(params)}#${queryString.stringify(hashParams)}`

              return (
                <tr key={groupKey}>
                  <td>{groupKey}</td>
                  <td>{this.renderUsers(group)}</td>
                  <td><a href={href} className="button" target="_blank">Join Group</a></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }
}

