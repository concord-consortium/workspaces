import * as React from "react"
import * as firebase from "firebase"
import * as queryString from "query-string"

import { FirebaseDocumentInfo, Document, FirebasePublication, FirebaseArtifact, FirebasePublicationWindowMap } from "../lib/document"
import { Window, FirebaseWindowAttrs, FirebaseWindowAttrsMap } from "../lib/window"
import { WindowComponent } from "./window"
import { MinimizedWindowComponent } from "./minimized-window"
import { InlineEditorComponent } from "./inline-editor"
import { SidebarComponent } from "./sidebar"
import { WindowManager, WindowManagerState, DragType } from "../lib/window-manager"
import { v4 as uuidV4} from "uuid"
import { PortalUser, PortalUserMap, PortalActivity, PortalUserConnectionStatusMap, PortalUserConnected, PortalUserDisconnected } from "../lib/auth"
import { AppHashParams } from "./app"
import escapeFirebaseKey from "../lib/escape-firebase-key"
import { getDocumentPath, getPublicationsRef, getArtifactsPath, getPublicationsPath, getArtifactsStoragePath } from "../lib/refs"
import { CollabSpaceClientPublishRequest, CollabSpaceClientPublishRequestMessage } from "../lib/collabspace-client"

const timeago = require("timeago.js")
const timeagoInstance = timeago()

export interface WorkspaceComponentProps {
  portalUser: PortalUser|null
  firebaseUser: firebase.User
  portalActivity: PortalActivity|null
  document: Document
  setTitle: ((documentName?:string|null) => void)|null
  isTemplate: boolean
  groupRef: firebase.database.Reference|null
  group: number|null
  leaveGroup?: () => void
}
export interface WorkspaceComponentState extends WindowManagerState {
  documentInfo: FirebaseDocumentInfo|null
  workspaceName: string
  debugInfo: string
  groupUsers: PortalUserConnectionStatusMap|null
  classUserLookup: PortalUserMap
  viewArtifact: FirebaseArtifact|null
  publishing: boolean
}

export class WorkspaceComponent extends React.Component<WorkspaceComponentProps, WorkspaceComponentState> {
  infoRef: firebase.database.Reference
  connectedRef: firebase.database.Reference|null
  userRef: firebase.database.Reference|null
  groupUsersRef: firebase.database.Reference|null
  windowManager: WindowManager
  userOnDisconnect: firebase.database.OnDisconnect|null

  constructor (props:WorkspaceComponentProps) {
    super(props)

    const {portalActivity} = props

    const classUserLookup:PortalUserMap = {}
    if (portalActivity) {
      portalActivity.classInfo.students.forEach((student) => {
        classUserLookup[escapeFirebaseKey(student.email)] = student
      })
    }

    this.state = {
      documentInfo: null,
      allOrderedWindows: [],
      minimizedWindows: [],
      topWindow: null,
      workspaceName: this.getWorkspaceName(portalActivity),
      debugInfo: portalActivity ? `Class ID: ${portalActivity.classInfo.classHash}` : "",
      groupUsers: null,
      classUserLookup: classUserLookup,
      viewArtifact: null,
      publishing: false
    }

    this.changeDocumentName = this.changeDocumentName.bind(this)
    this.toggleViewArtifact = this.toggleViewArtifact.bind(this)
    this.clearViewArtifact = this.clearViewArtifact.bind(this)
    this.promptToChangeGroup = this.promptToChangeGroup.bind(this)

    this.handleDrop = this.handleDrop.bind(this)
    this.handleDragOver = this.handleDragOver.bind(this)
    this.handleAddDrawingButton = this.handleAddDrawingButton.bind(this)
    this.handleCreateDemoButton = this.handleCreateDemoButton.bind(this)
    this.handleInfoChange = this.handleInfoChange.bind(this)
    this.handleConnected = this.handleConnected.bind(this)
    this.handleGroupUsersChange = this.handleGroupUsersChange.bind(this)
    this.handleWindowMouseDown = this.handleWindowMouseDown.bind(this)
    this.handleWindowMouseMove = this.handleWindowMouseMove.bind(this)
    this.handleWindowMouseUp = this.handleWindowMouseUp.bind(this)
    this.handlePublishButton = this.handlePublishButton.bind(this)
  }

  getWorkspaceName(portalActivity:PortalActivity|null) {
    if (!portalActivity) {
      return "Template"
    }
    const {classInfo, isDemo} = portalActivity
    const teacherNames = classInfo.teachers.map((teacher) => isDemo ? teacher.fullName : teacher.lastName)
    const domain = isDemo ? "" : `: ${portalActivity.domain}`
    return `${classInfo.name}: ${teacherNames.join(" & ")}${domain}`
  }

  componentWillMount() {
    this.windowManager = new WindowManager({
      document: this.props.document,
      onStateChanged: (newState) => this.setState(newState),
      syncChanges: this.props.isTemplate
    })

    this.infoRef = this.props.document.ref.child("info")
    this.infoRef.on("value", this.handleInfoChange)

    const {groupRef, portalUser} = this.props
    if (groupRef) {
      this.groupUsersRef = groupRef.child("users")
      this.groupUsersRef.on("value", this.handleGroupUsersChange)

      if (portalUser && portalUser.type === "student") {
        this.userRef = this.groupUsersRef.child(escapeFirebaseKey(portalUser.email))
        this.connectedRef = firebase.database().ref(".info/connected")
        this.connectedRef.on("value", this.handleConnected)
      }
    }

    window.addEventListener("mousedown", this.handleWindowMouseDown)
    window.addEventListener("mousemove", this.handleWindowMouseMove, true)
    window.addEventListener("mouseup", this.handleWindowMouseUp, true)
  }

  componentWillUnmount() {
    this.windowManager.destroy()

    if (this.userRef) {
      this.userOnDisconnect && this.userOnDisconnect.cancel()
      const disconnected:PortalUserDisconnected = {
        connected: false,
        disconnectedAt: firebase.database.ServerValue.TIMESTAMP
      }
      this.userRef.set(disconnected)
    }

    this.infoRef.off("value", this.handleInfoChange)
    this.connectedRef && this.connectedRef.off("value", this.handleConnected)
    this.groupUsersRef && this.groupUsersRef.off("value", this.handleGroupUsersChange)

    window.removeEventListener("mousedown", this.handleWindowMouseDown)
    window.removeEventListener("mousemove", this.handleWindowMouseMove, true)
    window.removeEventListener("mouseup", this.handleWindowMouseUp, true)
  }

  toggleViewArtifact(artifact: FirebaseArtifact) {
    this.setState({viewArtifact: artifact === this.state.viewArtifact ? null : artifact})
  }

  clearViewArtifact() {
    this.setState({viewArtifact: null})
  }

  handleConnected(snapshot:firebase.database.DataSnapshot|null) {
    if (snapshot && snapshot.val() && this.userRef) {
      const connected:PortalUserConnected = {
        connected: true,
        connectedAt: firebase.database.ServerValue.TIMESTAMP
      }
      const disconnected:PortalUserDisconnected = {
        connected: false,
        disconnectedAt: firebase.database.ServerValue.TIMESTAMP
      }
      this.userOnDisconnect = this.userRef.onDisconnect()
      this.userOnDisconnect.set(disconnected)
      this.userRef.set(connected)
    }
  }

  handleGroupUsersChange(snapshot:firebase.database.DataSnapshot|null) {
    if (snapshot && this.groupUsersRef) {
      const groupUsers:PortalUserConnectionStatusMap|null = snapshot.val()
      this.setState({groupUsers})
    }
  }

  handleInfoChange(snapshot:firebase.database.DataSnapshot|null) {
    if (snapshot) {
      const documentInfo:FirebaseDocumentInfo|null = snapshot.val()
      this.setState({documentInfo})
      if (this.props.setTitle) {
        this.props.setTitle(documentInfo ? documentInfo.name : null)
      }
    }
  }

  handleWindowMouseDown(e:MouseEvent) {
    const {dragInfo} = this.windowManager
    const windowProps = dragInfo.window && dragInfo.window.attrs
    if (windowProps) {
      dragInfo.starting = {
        x: e.clientX,
        y: e.clientY,
        top: windowProps.top,
        left: windowProps.left,
        width: windowProps.width,
        height: windowProps.height
      }
    }
  }

  handleWindowMouseMove(e:MouseEvent) {
    const {dragInfo} = this.windowManager
    if (dragInfo.type !== DragType.None) {
      e.preventDefault()
      e.stopPropagation()
      const {starting} = dragInfo
      const newWindowProps = dragInfo.window && dragInfo.window.attrs
      if (newWindowProps && starting) {
        const [dx, dy] = [e.clientX - starting.x, e.clientY - starting.y]
        switch (dragInfo.type) {
          case DragType.Position:
            newWindowProps.top = Math.max(0, starting.top + dy)
            newWindowProps.left = Math.max(0, starting.left + dx)
            break
          case DragType.GrowLeft:
            newWindowProps.left = Math.max(0, starting.left + dx)
            newWindowProps.width = starting.width - dx
            break
          case DragType.GrowUp:
            newWindowProps.top = Math.max(0, starting.top + dy)
            newWindowProps.height = starting.height - dy
            break
          case DragType.GrowRight:
            newWindowProps.width = starting.width + dx
            break
          case DragType.GrowDown:
            newWindowProps.height = starting.height + dy
            break
          case DragType.GrowDownLeft:
            newWindowProps.left = Math.max(0, starting.left + dx)
            newWindowProps.width = starting.width - dx
            newWindowProps.height = starting.height + dy
            break
          case DragType.GrowDownRight:
            newWindowProps.width = starting.width + dx
            newWindowProps.height = starting.height + dy
            break
        }
        this.windowManager.updateDragWindow(newWindowProps)
      }
    }
  }

  handleWindowMouseUp(e:MouseEvent) {
    const {dragInfo} = this.windowManager
    if (dragInfo.type !== DragType.None) {
      e.preventDefault()
      e.stopPropagation()
      this.windowManager.registerDragWindow(null, DragType.None)
    }
  }

  changeDocumentName(newName: string) {
    if (this.state.documentInfo) {
      this.state.documentInfo.name = newName
      this.infoRef.set(this.state.documentInfo)
    }
  }

  handleDragOver(e:React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
  }

  handleDrop(e:React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const [url, ...rest] = e.dataTransfer.getData("text/uri-list").split("\n")
    if (url) {
      this.windowManager.add(url, "Untitled")
    }
  }

  handleAddDrawingButton() {
    const title = (prompt("Enter the title of the drawing", "Untitled Drawing") || "").trim()
    if (title.length > 0) {
      this.windowManager.add(`${window.location.origin}/drawing-tool.html`, title)
    }
  }

  handleCreateDemoButton() {
    const hashParams:AppHashParams = {
      template: this.props.document.getTemplateHashParam(),
      demo: uuidV4()
    }
    window.open(`${window.location.origin}/#${queryString.stringify(hashParams)}`)
  }

  handlePublishButton() {
    const {groupUsers} = this.state
    const {portalActivity, portalUser, groupRef, group} = this.props
    if (!groupUsers || !portalActivity || !portalUser || (portalUser.type === "teacher") || !groupRef || !group) {
      return
    }

    const donePublishing = (err?:any) => {
      this.setState({publishing: false})
      if (err) {
        alert(err.toString())
      }
    }

    this.setState({publishing: true})

    // copy the doc
    this.props.document.copy(getDocumentPath(portalActivity))
      .then((document) => {

        // open the doc to get the windows
        document.dataRef.child("windows/attrs").once("value")
          .then((snapshot) => {
            const attrsMap:FirebaseWindowAttrsMap = snapshot.val() || {}
            const windows:FirebasePublicationWindowMap = {}
            Object.keys(attrsMap).forEach((windowId) => {
              const attrs = attrsMap[windowId]
              if (attrs) {
                windows[windowId] = {
                  title: attrs.title,
                  artifacts: {}
                }
              }
            })

            // then create the publication
            const publication:FirebasePublication = {
              activityId: portalActivity.id,
              group: group,
              creator: portalUser.email,
              groupMembers: groupUsers,
              createdAt: firebase.database.ServerValue.TIMESTAMP,
              documentId: document.id,
              windows: windows
            }

            const publicationRef = getPublicationsRef(portalActivity).push(publication)
            const publicationId = publicationRef.key
            if (publicationId) {

              // and finally tell all the child windows so they can generate artifacts
              const publishRequest:CollabSpaceClientPublishRequest = {
                publicationsPath: getPublicationsPath(portalActivity, publicationId),
                artifactStoragePath: getArtifactsStoragePath(portalActivity, publicationId)
              }
              this.windowManager.postToAllWindows(
                CollabSpaceClientPublishRequestMessage,
                publishRequest
              )
            }

            donePublishing()
          })
          .catch(donePublishing)
      })
      .catch(donePublishing)
  }

  promptToChangeGroup() {
    if (this.props.leaveGroup && confirm("Do you want to change your group?")) {
      this.props.leaveGroup()
    }
  }

  renderDocumentInfo() {
    const {documentInfo} = this.state
    if (!documentInfo) {
      return null
    }
    return (
      <div className="document-info">
        <div className="document-name">
          {this.props.setTitle ? <InlineEditorComponent text={documentInfo.name} changeText={this.changeDocumentName} /> : documentInfo.name}
        </div>
        <div className="instance-info" title={this.state.debugInfo}>{this.state.workspaceName}</div>
      </div>
    )
  }

  renderGroupInfo() {
    const {portalActivity} = this.props
    const {groupUsers} = this.state
    if (!groupUsers || !portalActivity) {
      return null
    }
    const users:JSX.Element[] = []
    Object.keys(groupUsers).forEach((email) => {
      const groupUser = groupUsers[email]
      const portalUser = this.state.classUserLookup[escapeFirebaseKey(email)]
      if (portalUser) {
        const {connected} = groupUser
        const className = `group-user ${groupUser.connected ? "connected" : "disconnected"}`
        const titleSuffix = groupUser.connected ? `connected ${timeagoInstance.format(groupUser.connectedAt)}` : `disconnected ${timeagoInstance.format(groupUser.disconnectedAt)}`
        users.push(<div key={email} className={className} title={`${portalUser.fullName}: ${titleSuffix}`}>{portalUser.initials}</div>)
      }
    })
    return (
      <div className="group-info"><div className="group-name clickable" onClick={this.promptToChangeGroup} title="Click to leave group">Group {this.props.group}</div>{users}</div>
    )
  }

  renderHeader() {
    const {firebaseUser, portalUser} = this.props
    const className = `header${this.props.isTemplate ? " template" : ""}`
    const userName = portalUser ? portalUser.fullName : (firebaseUser.isAnonymous ? "Anonymous User" : firebaseUser.displayName)
    return (
      <div className={className}>
        {this.renderDocumentInfo()}
        <div className="user-info">
          <div className="user-name">{userName}</div>
        </div>
        {this.renderGroupInfo()}
      </div>
    )
  }

  renderReadonlyToolbar() {
    return (
      <div className="readonly-message">
        View only.  You do not have edit access to this template.
      </div>
    )
  }

  renderToolbarButtons() {
    const {document} = this.props
    const showDemoButton = this.props.isTemplate && !document.isReadonly
    const showPublishButton = !this.props.isTemplate && !document.isReadonly
    return (
      <div className="buttons">
        <div className="left-buttons">
          <button type="button" onClick={this.handleAddDrawingButton}>Add Drawing</button>
        </div>
        <div className="right-buttons">
          {showDemoButton ? <button type="button" onClick={this.handleCreateDemoButton}>Create Demo</button> : null}
          {showPublishButton ? <button type="button" disabled={this.state.publishing} onClick={this.handlePublishButton}>Publish</button> : null}
        </div>
      </div>
    )
  }

  renderToolbar() {
    return (
      <div className="toolbar">
        {this.props.document.isReadonly ? this.renderReadonlyToolbar() : this.renderToolbarButtons()}
      </div>
    )
  }

  renderAllWindows() {
    const {allOrderedWindows, topWindow} = this.state
    return allOrderedWindows.map((orderedWindow) => {
      const {window} = orderedWindow
      return <WindowComponent
               key={window.id}
               window={window}
               isTopWindow={window === topWindow}
               zIndex={orderedWindow.order}
               windowManager={this.windowManager}
               isTemplate={this.props.isTemplate}
             />
    })
  }

  renderMinimizedWindows() {
    const windows = this.state.minimizedWindows.map((window) => {
      return <MinimizedWindowComponent
               key={window.id}
               window={window}
               windowManager={this.windowManager}
             />
    })
    return (
      <div className="minimized">{windows}</div>
    )
  }

  renderWindowArea() {
    const hasMinmizedWindows = this.state.minimizedWindows.length > 0
    const nonMinimizedClassName = `non-minimized${hasMinmizedWindows ? " with-minimized" : ""}`
    const className = `window-area${!this.props.isTemplate ? " with-sidebar" : ""}`
    return (
      <div className={className}>
        <div className={nonMinimizedClassName}>
          {this.renderAllWindows()}
        </div>
        {hasMinmizedWindows ? this.renderMinimizedWindows() : null}
      </div>
    )
  }

  renderReadonlyBlocker() {
    if (this.props.document.isReadonly) {
      return <div className="readonly-blocker" />
    }
    return null
  }

  renderSidebarComponent() {
    const {portalActivity, portalUser, group} = this.props
    if (!portalActivity || !portalUser || !group) {
      return null
    }
    return <SidebarComponent
             portalActivity={portalActivity}
             portalUser={portalUser}
             group={group}
             toggleViewArtifact={this.toggleViewArtifact}
             publishing={this.state.publishing}
             windowManager={this.windowManager}
           />
  }

  renderArtifact() {
    if (!this.state.viewArtifact) {
      return null
    }
    return (
      <div className="image-lightbox" onClick={this.clearViewArtifact}>
        <div className="image-lightbox-background" />
        <div className="image-lightbox-image">
          <div>
            <img src={this.state.viewArtifact.url} draggable={false} />
          </div>
        </div>
      </div>
    )
  }

  render() {
    return (
      <div className="workspace" onDrop={this.handleDrop} onDragOver={this.handleDragOver}>
        {this.renderHeader()}
        {this.renderToolbar()}
        {this.renderWindowArea()}
        {this.renderSidebarComponent()}
        {this.renderArtifact()}
        {this.renderReadonlyBlocker()}
      </div>
    )
  }
}