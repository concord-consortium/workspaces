import * as React from "react"
import * as firebase from "firebase"
import { Window } from "../lib/window"
import { WindowManager } from "../lib/window-manager"
import { PortalActivity, PortalUser, PortalUserMap } from "../lib/auth"
import { getPublicationsRef, getArtifactsRef } from "../lib/refs"
import { FirebasePublication, FirebasePublicationWindow, FirebaseArtifact } from "../lib/document"
import { CollabSpaceClientThumbnailWidth } from "../lib/collabspace-client"
import escapeFirebaseKey from "../lib/escape-firebase-key"

const timeago = require("timeago.js")
const timeagoInstance = timeago()

export interface FirebasePublicationItem {
  id: string
  index: number
  publication: FirebasePublication
}

export interface FirebaseArtifactItem {
  id: string
  artifact: FirebaseArtifact
}

export interface SidebarPublicationArtifactComponentProps {
  artifact: FirebaseArtifact
  toggleViewArtifact: (artifact: FirebaseArtifact) => void
}
export interface SidebarPublicationArtifactComponentState {
}

export class SidebarPublicationArtifactComponent extends React.Component<SidebarPublicationArtifactComponentProps, SidebarPublicationArtifactComponentState> {
  publicationsRef: firebase.database.Reference

  constructor (props:SidebarPublicationArtifactComponentProps) {
    super(props)
    this.state = {}
    this.toggleViewArtifact = this.toggleViewArtifact.bind(this)
  }

  toggleViewArtifact() {
    this.props.toggleViewArtifact(this.props.artifact)
  }

  render() {
    const {artifact} = this.props
    const url = artifact.thumbnailUrl || artifact.url
    return (
      <div className="artifact" onClick={this.toggleViewArtifact}>
        <img src={url} title={artifact.title} style={{width: CollabSpaceClientThumbnailWidth}} draggable={false} />
      </div>
    )
  }
}

export interface SidebarPublicationWindowComponentProps {
  windowId: string
  publicationId: string
  publication: FirebasePublication
  window: FirebasePublicationWindow
  toggleViewArtifact: (artifact: FirebaseArtifact) => void
  portalActivity: PortalActivity
  windowManager: WindowManager
  creatorName: string
}
export interface SidebarPublicationWindowComponentState {
  artifactItems: FirebaseArtifactItem[]
}

export class SidebarPublicationWindowComponent extends React.Component<SidebarPublicationWindowComponentProps, SidebarPublicationWindowComponentState> {
  artifactsRef: firebase.database.Reference

  constructor (props:SidebarPublicationWindowComponentProps) {
    super(props)
    this.state = {
      artifactItems: []
    }
    this.artifactsRef = getPublicationsRef(this.props.portalActivity, this.props.publicationId).child("windows").child(this.props.windowId).child("artifacts")
    this.handleArtifactAdded = this.handleArtifactAdded.bind(this)
    this.handleCopyIntoDocument = this.handleCopyIntoDocument.bind(this)
  }

  componentWillMount() {
    this.artifactsRef.on("child_added", this.handleArtifactAdded)
  }

  componentWillUnmount() {
    this.artifactsRef.off("child_added", this.handleArtifactAdded)
  }

  handleArtifactAdded(snapshot:firebase.database.DataSnapshot) {
    // we have to listen for added artifacts as the user might click on the published item
    // before the artifact is created and we only listen for publication child_added not value
    const artifact:FirebaseArtifact = snapshot.val()
    const {artifactItems} = this.state
    artifactItems.push({id: snapshot.key as string, artifact})
    this.setState({artifactItems})
  }

  handleCopyIntoDocument() {
    const title = `${this.props.window.title} by ${this.props.creatorName} in group ${this.props.publication.group}`
    this.props.windowManager.copyWindowFromPublication(this.props.portalActivity, this.props.publication, this.props.windowId, title)
      .catch((err:any) => alert(err.toString()))
  }

  renderArtifacts() {
    const {artifactItems} = this.state
    if (artifactItems.length === 0) {
      return null
    }
    return (
      <div className="artifacts">
        {artifactItems.map((artifactItem) => {
          return <SidebarPublicationArtifactComponent
                   key={artifactItem.id}
                   artifact={artifactItem.artifact}
                   toggleViewArtifact={this.props.toggleViewArtifact}
                 />
        })}
      </div>
    )
  }

  render() {
    return (
      <div className="window">
        <div className="window-title">{this.props.window.title}</div>
        {this.renderArtifacts()}
        <div className="window-actions">
          <div onClick={this.handleCopyIntoDocument} className="clickable">Copy Into Your Document</div>
        </div>
      </div>
    )
  }
}

export interface SidebarPublicationComponentProps {
  publicationItem: FirebasePublicationItem
  userMap: PortalUserMap
  toggleViewArtifact: (artifact: FirebaseArtifact) => void
  portalActivity: PortalActivity
  windowManager: WindowManager
}
export interface SidebarPublicationComponentState {
  expanded: boolean
  creatorName: string
}

export class SidebarPublicationComponent extends React.Component<SidebarPublicationComponentProps, SidebarPublicationComponentState> {
  publicationsRef: firebase.database.Reference

  constructor (props:SidebarPublicationComponentProps) {
    super(props)
    this.state = {
      expanded: false,
      creatorName: this.getUserName(this.props.publicationItem.publication.creator)
    }
    this.handleToggle = this.handleToggle.bind(this)
  }

  handleToggle() {
    this.setState({expanded: !this.state.expanded})
  }

  getUserName(email:string) {
    const user = this.props.userMap[escapeFirebaseKey(email)]
    return user ? user.fullName : "Unknown Student"
  }

  renderWindows() {
    const {publicationItem} = this.props
    const {publication} = publicationItem
    const windowIds = Object.keys(publication.windows)

    if (windowIds.length === 0) {
      return null
    }

    return (
      <div className="windows">
        {windowIds.map((windowId) => {
          const window = publication.windows[windowId]
          return <SidebarPublicationWindowComponent
                   key={windowId}
                   publicationId={publicationItem.id}
                   publication={publication}
                   windowId={windowId}
                   window={window}
                   creatorName={this.state.creatorName}
                   toggleViewArtifact={this.props.toggleViewArtifact}
                   portalActivity={this.props.portalActivity}
                   windowManager={this.props.windowManager}
                 />
        })}
      </div>
    )
  }

  renderGroupUsers() {
    const {publication} = this.props.publicationItem
    const groupUsers:string[] = []
    const escapedCreatorEmail = escapeFirebaseKey(publication.creator)
    Object.keys(publication.groupMembers).forEach((email) => {
      if (email !== escapedCreatorEmail) {
        groupUsers.push(this.getUserName(email))
      }
    })
    if (groupUsers.length === 0) {
      return null
    }
    return (
      <div className="group-users">
        With {groupUsers.join(", ")}
      </div>
    )
  }

  renderExpanded() {
    const {publication} = this.props.publicationItem
    return (
      <div className="expanded-info">
        <div className="user-name">{this.state.creatorName}</div>
        {this.renderGroupUsers()}
        <div className="clickable">Open In Dashboard <strong>(TBD)</strong></div>
        {this.renderWindows()}
      </div>
    )
  }

  render() {
    const {publicationItem} = this.props
    const {publication, index} = publicationItem
    const {group, createdAt} = publication
    const user = this.props.userMap[publication.creator]
    const name = user ? user.fullName : "Unknown Student"
    const initials = user ? user.initials : "?"
    return (
      <div className="publication">
        <div className="publication-header clickable" onClick={this.handleToggle}>
          #{index} <span className="initials" title={name}>{initials}</span> in group {group} <span className="ago">{timeagoInstance.format(createdAt)}</span>
        </div>
        {this.state.expanded ? this.renderExpanded() : null}
      </div>
    )
  }
}

export interface SidebarComponentProps {
  portalActivity: PortalActivity
  portalUser: PortalUser
  group: number
  toggleViewArtifact: (artifact: FirebaseArtifact) => void
  publishing: boolean
  windowManager: WindowManager
}
export interface SidebarComponentState {
  publicationItems: FirebasePublicationItem[]
  filter: "activity" | "group" | "mine"
}

export class SidebarComponent extends React.Component<SidebarComponentProps, SidebarComponentState> {
  publicationsRef: firebase.database.Reference
  userMap: PortalUserMap

  constructor (props:SidebarComponentProps) {
    super(props)
    this.state = {
      publicationItems: [],
      filter: "activity"
    }
    this.publicationsRef = getPublicationsRef(this.props.portalActivity)
    this.handlePublicationAdded = this.handlePublicationAdded.bind(this)

    this.userMap = {}
    this.props.portalActivity.classInfo.students.forEach((student) => {
      this.userMap[student.email] = student
      this.userMap[escapeFirebaseKey(student.email)] = student
    })
  }

  componentWillMount() {
    this.publicationsRef.on("child_added", this.handlePublicationAdded)
  }

  componentWillUnmount() {
    this.publicationsRef.off("child_added", this.handlePublicationAdded)
  }

  handlePublicationAdded(snapshot:firebase.database.DataSnapshot) {
    const {publicationItems} = this.state
    const publication:FirebasePublication = snapshot.val()
    if (publication.activityId === this.props.portalActivity.id) {
      const publicationItem:FirebasePublicationItem = {
        index: publicationItems.length + 1,
        id: snapshot.key as string,
        publication
      }
      publicationItems.unshift(publicationItem)
      this.setState({publicationItems})
    }
  }

  getFilteredPublicationItems() {
    const {publicationItems, filter} = this.state
    const {portalActivity, portalUser, group} = this.props
    const email = portalUser.type === "student" ? portalUser.email : ""
    return publicationItems.filter((publicationItem) => {
      const {publication} = publicationItem
      switch (filter) {
        case "group":
          return publication.group === group
        case "mine":
          return publication.creator === email
        default:
          return true
      }
    })
  }

  renderFilterSelector() {
    const className = (filter:string) => {
      return `clickable ${filter === this.state.filter ? "selected-filter" : ""}`
    }
    return (
      <div className="filter-selector">
        <span className={className("activity")} onClick={() => this.setState({filter: "activity"})}>Activity</span>
        <span className={className("group")} onClick={() => this.setState({filter: "group"})}>Group</span>
        <span className={className("mine")} onClick={() => this.setState({filter: "mine"})}>Mine</span>
      </div>
    )
  }

  renderPublishing() {
    if (!this.props.publishing) {
      return null
    }
    return (
      <div className="publishing">
        <div className="progress">Publishing</div>
      </div>
    )
  }

  renderPublications() {
    const publicationItems = this.getFilteredPublicationItems()
    if (publicationItems.length === 0) {
      return <div className="none-found">No publications were found</div>
    }

    return (
      <div className="publications">
        {publicationItems.map((publicationItem) => {
          return <SidebarPublicationComponent
                   key={publicationItem.id}
                   publicationItem={publicationItem}
                   userMap={this.userMap}
                   toggleViewArtifact={this.props.toggleViewArtifact}
                   portalActivity={this.props.portalActivity}
                   windowManager={this.props.windowManager}
                 />
        })}
      </div>
    )
  }

  render() {
    return (
      <div className="sidebar">
        <div className="sidebar-header">Publications</div>
        {this.renderFilterSelector()}
        {this.renderPublishing()}
        {this.renderPublications()}
      </div>
    )
  }
}