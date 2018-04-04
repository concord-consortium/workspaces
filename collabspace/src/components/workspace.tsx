import * as React from "react"
import * as firebase from "firebase"
import * as queryString from "query-string"
import * as superagent from "superagent"

import { FirebaseDocumentInfo, Document, FirebasePublication, FirebaseArtifact, FirebasePublicationWindowMap, FirebaseDocument } from "../lib/document"
import { Window, FirebaseWindowAttrs, FirebaseWindowAttrsMap } from "../lib/window"
import { WindowComponent } from "./window"
import { MinimizedWindowComponent } from "./minimized-window"
import { InlineEditorComponent } from "./inline-editor"
import { SidebarComponent } from "./sidebar"
import { WindowManager, WindowManagerState, DragType, OrderedWindow, AddWindowLogParams } from "../lib/window-manager"
import { v4 as uuidV4} from "uuid"
import { PortalUser, PortalOffering, PortalUserConnectionStatusMap, PortalUserConnected, PortalUserDisconnected, PortalTokens, AuthQueryParams } from "../lib/auth"
import { AppHashParams } from "./app"
import escapeFirebaseKey from "../lib/escape-firebase-key"
import { getDocumentPath, getPublicationsRef, getArtifactsPath, getPublicationsPath, getArtifactsStoragePath } from "../lib/refs"
import { WorkspaceClientPublishRequest, WorkspaceClientPublishRequestMessage } from "../../../shared/workspace-client"
import { UserLookup } from "../lib/user-lookup"
import { Support, SupportTypeStrings, FirebaseSupportMap, FirebaseSupportSeenUsersSupportMap } from "./dashboard-support"
import { LogManager } from "../../../shared/log-manager"
import { merge } from "lodash"
import { LiveTimeAgoComponent } from "./live-time-ago"
import { UploadImageDialogComponent } from "./upload-image-dialog"

export interface AddWindowLogParamsParams {
  ownerId?: string
  copiedFrom?: string
}

export interface NonPrivateWindowParams {
  window?: Window
  ownerId?: string
}

export interface WorkspaceComponentProps {
  portalUser: PortalUser|null
  firebaseUser: firebase.User
  portalOffering: PortalOffering|null
  portalTokens: PortalTokens|null
  document: Document
  setTitle: ((documentName?:string|null) => void)|null
  isTemplate: boolean
  groupRef: firebase.database.Reference|null
  supportsRef: firebase.database.Reference|null
  supportsSeenRef: firebase.database.Reference|null
  group: number|null
  leaveGroup?: () => void
  publication: FirebasePublication|null
  logManager: LogManager|null
}
export interface WorkspaceComponentState extends WindowManagerState {
  documentInfo: FirebaseDocumentInfo|null
  workspaceName: string
  debugInfo: string
  groupUsers: PortalUserConnectionStatusMap|null
  viewArtifact: FirebaseArtifact|null
  publishing: boolean
  supports: FirebaseSupportMap|null
  supportsSeen: FirebaseSupportSeenUsersSupportMap|null
  showSupportsDropdown: boolean
  visibleSupportIds: string[]
  showModal: "copy"|"add-drawing"|"add-table"|"add-graph"|null
  onModalOk: ((title: string, ownerId?:string|null) => void) |null
  copyWindow: Window|null
  showUploadImageDialog: boolean
}

export class WorkspaceComponent extends React.Component<WorkspaceComponentProps, WorkspaceComponentState> {
  infoRef: firebase.database.Reference
  connectedRef: firebase.database.Reference|null
  userRef: firebase.database.Reference|null
  groupUsersRef: firebase.database.Reference|null
  windowManager: WindowManager
  userOnDisconnect: firebase.database.OnDisconnect|null
  userLookup: UserLookup
  modalDialogNewWindowTitle: HTMLInputElement|null

  constructor (props:WorkspaceComponentProps) {
    super(props)

    const {portalOffering} = props

    this.userLookup = new UserLookup(portalOffering ? portalOffering.classInfo : undefined)

    this.state = {
      documentInfo: null,
      allOrderedWindows: [],
      minimizedWindows: [],
      topWindow: null,
      workspaceName: this.getWorkspaceName(portalOffering),
      debugInfo: portalOffering ? `Class ID: ${portalOffering.classInfo.classHash}` : "",
      groupUsers: null,
      viewArtifact: null,
      publishing: false,
      supports: null,
      supportsSeen: null,
      showSupportsDropdown: false,
      visibleSupportIds: [],
      showModal: null,
      onModalOk: null,
      copyWindow: null,
      showUploadImageDialog: false
    }
  }

  getWorkspaceName(portalOffering:PortalOffering|null) {
    if (!portalOffering) {
      return "Template"
    }
    const {classInfo, isDemo} = portalOffering
    const teacherNames = classInfo.teachers.map((teacher) => isDemo ? teacher.fullName : teacher.lastName)
    const domain = isDemo ? "" : `: ${portalOffering.domain}`
    return `${classInfo.name}: ${teacherNames.join(" & ")}${domain}`
  }

  componentWillMount() {
    this.windowManager = new WindowManager({
      document: this.props.document,
      onStateChanged: (newState) => {
        this.setState(newState)
      },
      syncChanges: this.props.isTemplate,
      tokens: this.props.portalTokens,
      nonPrivateWindow: this.nonPrivateWindow
    })

    if (this.props.logManager) {
      this.windowManager.setLogManager(this.props.logManager)
    }

    this.infoRef = this.props.document.ref.child("info")
    this.infoRef.on("value", this.handleInfoChange)

    const {groupRef, portalUser} = this.props
    if (groupRef) {
      this.groupUsersRef = groupRef.child("users")
      this.groupUsersRef.on("value", this.handleGroupUsersChange)

      if (portalUser) {
        this.userRef = this.groupUsersRef.child(escapeFirebaseKey(portalUser.id))
        this.connectedRef = firebase.database().ref(".info/connected")
        this.connectedRef.on("value", this.handleConnected)
      }
    }

    const {supportsRef, supportsSeenRef} = this.props
    if (supportsRef) {
      supportsRef.on("value", this.handleSupports)
    }
    if (supportsSeenRef) {
      supportsSeenRef.on("value", this.handleSupportsSeen)
    }

    window.addEventListener("mousedown", this.handleWindowMouseDown)
    window.addEventListener("mousemove", this.handleWindowMouseMove, true)
    window.addEventListener("mouseup", this.handleWindowMouseUp, true)
  }

  componentDidUpdate() {
    if (this.modalDialogNewWindowTitle) {
      this.modalDialogNewWindowTitle.select()
      this.modalDialogNewWindowTitle.focus()
    }
  }

  componentWillReceiveProps(nextProps:WorkspaceComponentProps) {
    if (nextProps.logManager && (nextProps.logManager !== this.props.logManager)) {
      this.windowManager.setLogManager(nextProps.logManager)
    }
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

  userId() {
    return this.props.portalUser ? this.props.portalUser.id: this.props.firebaseUser.uid
  }

  nonPrivateWindow = (params: NonPrivateWindowParams) => {
    const ownerId = params.ownerId || (params.window ? params.window.attrs.ownerId : undefined)
    return !ownerId || (ownerId === this.userId())
  }

  handleToggleViewArtifact = (artifact: FirebaseArtifact) => {
    this.setState({viewArtifact: artifact === this.state.viewArtifact ? null : artifact})
  }

  handleClearViewArtifact = () => {
    this.setState({viewArtifact: null})
  }

  handleConnected = (snapshot:firebase.database.DataSnapshot|null) => {
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

  handleGroupUsersChange = (snapshot:firebase.database.DataSnapshot|null) => {
    if (snapshot && this.groupUsersRef) {
      const groupUsers:PortalUserConnectionStatusMap|null = snapshot.val()
      this.setState({groupUsers})
    }
  }

  handleInfoChange = (snapshot:firebase.database.DataSnapshot|null) => {
    if (snapshot) {
      const documentInfo:FirebaseDocumentInfo|null = snapshot.val()
      this.setState({documentInfo})
      if (this.props.setTitle) {
        this.props.setTitle(documentInfo ? documentInfo.name : null)
      }
      if (documentInfo && this.props.logManager) {
        this.props.logManager.setSettings({
          activityName: documentInfo.name,
          url: documentInfo.portalUrl
        })
      }
    }
  }

  handleSupports = (snapshot:firebase.database.DataSnapshot|null) => {
    const {portalUser, group} = this.props
    if (portalUser && group && snapshot) {
      const allSupports:FirebaseSupportMap|null = snapshot.val()
      const supports:FirebaseSupportMap = {}
      if (allSupports) {
        const groupId = `group|${group}`
        const userId = `user|${portalUser.id}`
        Object.keys(allSupports).forEach((supportId) => {
          const support = allSupports[supportId]
          if (support) {
            const assignedTo = (support.assignedTo || "").split(",")
            if ((assignedTo.indexOf("class") !== -1) || (assignedTo.indexOf(groupId) !== -1) || (assignedTo.indexOf(userId) !== -1)) {
              supports[supportId] = support
            }
          }
        })
      }
      this.setState({supports})
    }
  }

  handleSupportsSeen = (snapshot:firebase.database.DataSnapshot|null) => {
    if (snapshot) {
      const supportsSeen:FirebaseSupportSeenUsersSupportMap|null = snapshot.val()
      this.setState({supportsSeen})
    }
  }

  handleWindowMouseDown = (e:MouseEvent) => {
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

  handleWindowMouseMove = (e:MouseEvent) => {
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

  handleWindowMouseUp = (e:MouseEvent) => {
    const {dragInfo} = this.windowManager
    if (dragInfo.type !== DragType.None) {
      e.preventDefault()
      e.stopPropagation()
      this.windowManager.registerDragWindow(null, DragType.None)
    }
  }

  handleChangeDocumentName = (newName: string) => {
    if (this.state.documentInfo) {
      this.state.documentInfo.name = newName
      this.infoRef.set(this.state.documentInfo)
    }
  }

  handleDragOver = (e:React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  handleDrop = (e:React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const [url, ...rest] = e.dataTransfer.getData("text/uri-list").split("\n")
    if (url) {
      this.windowManager.add({
        url,
        title: "Untitled",
        log: {name: "Dropped window", params: {url}}
      })
    }
  }

  constructRelativeUrl(filename:string) {
    const {location} = window
    return `${location.origin}${location.pathname.replace("/index.html", "/")}${filename}`
  }

  handleUploadImageButton = () => {
    this.setState({showUploadImageDialog: true});
  }

  handleHideUploadImageDialog = () => {
    this.setState({showUploadImageDialog: false});
  }

  handleAddUploadedImage = (title: string, imageUrl:string, isPrivate: boolean) => {
    const ownerId = isPrivate ? this.userId() : undefined
    this.setState({showUploadImageDialog: false});
    this.windowManager.add({
      url: this.constructRelativeUrl(`drawing-tool-v2.html?backgroundUrl=${encodeURIComponent(imageUrl)}`),
      title,
      ownerId,
      log: {name: "Added annotated drawing window", params: this.getAddWindowLogParams({ownerId})}
    })
  }


  getAddWindowLogParams(params:AddWindowLogParamsParams) {
    const addWindowParams:any = {
      private: !!params.ownerId,
      group: this.props.group,
    }
    if (params.copiedFrom) {
      addWindowParams.copiedFrom = params.copiedFrom
    }
    return addWindowParams
  }

  handleAddDrawingButton = () => {
    this.setState({
      showModal: "add-drawing",
      onModalOk: (title: string, ownerId?: string) => {
        this.windowManager.add({
          url: this.constructRelativeUrl("drawing-tool-v2.html"),
          title,
          ownerId,
          log: {name: "Added drawing window", params: this.getAddWindowLogParams({ownerId})}
        })
      }
    })
  }

  handleAddCaseTable = () => {
    this.setState({
      showModal: "add-table",
      onModalOk: (title: string, ownerId?: string) => {
        this.windowManager.add({
          url: this.constructRelativeUrl("neo-codap.html?mode=table"),
          title,
          ownerId,
          createNewDataSet: true,
          log: {name: "Added table window", params: this.getAddWindowLogParams({ownerId})}
        })
      }
    })
  }

  handleAddGraph = () => {
    this.setState({
      showModal: "add-graph",
      onModalOk: (title: string, ownerId?: string) => {
        this.windowManager.add({
          url: this.constructRelativeUrl("neo-codap.html?mode=graph"),
          title,
          ownerId,
          log: {name: "Added graph window", params: this.getAddWindowLogParams({ownerId})}
        })
      }
    })
  }

  handleCreateDemoButton = () => {
    const hashParams:AppHashParams = {
      template: this.props.document.getTemplateHashParam(),
      demo: uuidV4()
    }
    window.open(`#${queryString.stringify(hashParams)}`)
  }

  handleSyncLocalWindowState = (firebaseDocument:FirebaseDocument) => {
    if (firebaseDocument.data && firebaseDocument.data.windows) {
      const {windows} = firebaseDocument.data
      if (windows.attrs) {
        Object.keys(windows.attrs).forEach((windowId) => {
          const attrs = windows.attrs[windowId]
          if (attrs) {
            const localWindow = this.windowManager.windows[windowId]
            if (localWindow) {
              windows.attrs[windowId] = merge({}, localWindow.attrs, attrs.dataSet ? {dataSet: attrs.dataSet} : {})
            }
          }
        })
      }
      windows.order = this.windowManager.arrayToFirebaseOrderMap(this.windowManager.windowOrder)
      windows.minimizedOrder = this.windowManager.arrayToFirebaseOrderMap(this.windowManager.minimizedWindowOrder)
    }
  }

  handleCopy = (copyWindow:Window) => {
    this.setState({
      showModal: "copy",
      copyWindow,
      onModalOk: (title: string, ownerId: string) => {
        this.windowManager.copyWindow(copyWindow, title, ownerId)
      }
    })
  }

  handlePublishButton = () => {
    this.handlePublish(null)
  }

  handlePublish = (publishWindow:Window|null) => {
    const {groupUsers} = this.state
    const {portalOffering, portalUser, groupRef, group} = this.props
    if (!groupUsers || !portalOffering || !portalUser || !groupRef || !group) {
      return
    }

    const donePublishing = (err?:any) => {
      this.setState({publishing: false})
      if (err) {
        alert(err.toString())
      }
    }

    this.setState({publishing: true})

    // copy the doc with local window state
    this.props.document.copy(getDocumentPath(portalOffering), this.handleSyncLocalWindowState)
      .then((document) => {

        // open the doc to get the windows
        document.dataRef.child("windows/attrs").once("value")
          .then((snapshot) => {
            const attrsMap:FirebaseWindowAttrsMap = snapshot.val() || {}
            const windows:FirebasePublicationWindowMap = {}

            const windowIdsToPublish:string[] = []
            if (publishWindow) {
              windowIdsToPublish.push(publishWindow.id)

              /*
                leave out for now

              // find linked dataset windows
              const publishWindowAttrs = attrsMap[publishWindow.id]
              if (publishWindowAttrs && publishWindowAttrs.dataSet) {
                const dataSetId = publishWindowAttrs.dataSet.dataSetId
                Object.keys(attrsMap).forEach((windowId) => {
                  const attrs = attrsMap[windowId]
                  if ((windowId !== publishWindow.id) && attrs && attrs.dataSet && (attrs.dataSet.dataSetId === dataSetId)) {
                    windowIdsToPublish.push(windowId)
                  }
                })
              }
              */
            }

            Object.keys(attrsMap).forEach((windowId) => {
              const attrs = attrsMap[windowId]
              if (attrs && (!publishWindow || (windowIdsToPublish.indexOf(windowId) !== -1))) {
                windows[windowId] = {
                  title: attrs.title,
                  artifacts: {}
                }
                if (attrs.ownerId) {
                  windows[windowId].ownerId = attrs.ownerId
                }
              }
            })

            // then create the publication
            const publication:FirebasePublication = {
              offeringId: portalOffering.id,
              group: group,
              creator: portalUser.id,
              groupMembers: groupUsers,
              createdAt: firebase.database.ServerValue.TIMESTAMP,
              documentId: document.id,
              windows: windows,
              partial: publishWindow !== null
            }

            const publicationRef = getPublicationsRef(portalOffering).push(publication)
            const publicationId = publicationRef.key
            if (publicationId) {

              // and finally tell all the child windows so they can generate artifacts
              const publishRequest:WorkspaceClientPublishRequest = {
                publicationsPath: getPublicationsPath(portalOffering, publicationId),
                artifactStoragePath: getArtifactsStoragePath(portalOffering, publicationId)
              }

              if (publishWindow) {
                this.windowManager.postToWindowIds(
                  windowIdsToPublish,
                  WorkspaceClientPublishRequestMessage,
                  publishRequest
                )
              }
              else {
                this.windowManager.postToAllWindows(
                  WorkspaceClientPublishRequestMessage,
                  publishRequest
                )
              }
            }

            if (this.props.logManager) {
              this.props.logManager.logEvent("Published", null, {
                publisher: this.userId(),
                windowIds: windowIdsToPublish,
                group: this.props.group
              })
            }

            donePublishing()
          })
          .catch(donePublishing)
      })
      .catch(donePublishing)
  }

  handlePromptToChangeGroup = () => {
    if (this.props.leaveGroup && confirm("Do you want to change your group?")) {
      this.props.leaveGroup()
    }
  }

  handleViewAllPublications = () => {
    const {portalTokens} = this.props
    if (!portalTokens) {
      return
    }
    const {portalJWT, rawPortalJWT} = portalTokens

    const params:AuthQueryParams = queryString.parse(window.location.search)

    let newParams:AuthQueryParams = {}
    if (portalJWT.user_type === "learner") {
      newParams = {
        portalJWT: rawPortalJWT
      }
    }
    else {
      const {classInfoUrl, offeringId} = params
      if (!classInfoUrl || !offeringId) {
        alert("Missing classInfoUrl or offeringId in params!")
        return
      }
      newParams = {
        portalJWT: rawPortalJWT,
        classInfoUrl,
        offeringId
      }
    }

    if (params.demo) {
      newParams.demo = params.demo
    }

    window.location.href = `?${queryString.stringify(newParams)}`
  }

  handleCreateActivityButton = () => {
    const {documentInfo} = this.state
    const {portalTokens, firebaseUser, document} = this.props
    if (documentInfo && documentInfo.portalUrl && portalTokens && firebaseUser) {
      const apiUrl = `${documentInfo.portalUrl}api/v1/external_activities/create`
      const templateId = Document.StringifyTemplateHashParam(firebaseUser.uid, document.id)
      const templateUrl = `${window.location.origin}${window.location.pathname}#template=${templateId}`
      superagent
        .get(apiUrl)
        .query({name: documentInfo.name, url: templateUrl, append_auth_token: 1, external_report_url: "https://workspaces.concord.org/collabspace/dashboard.html"})
        .set("Authorization", `Bearer/JWT ${portalTokens.rawPortalJWT}`)
        .end((err, res) => {
          if (err) {
            alert((res.body ? res.body.message : null) || err)
          }
          else if (!res.body || !res.body.edit_url) {
            alert("No edit url found in create activity response")
          }
          else {
            documentInfo.portalEditUrl = res.body.edit_url
            this.infoRef.set(documentInfo)
            setTimeout(() => alert("The portal activity was created"), 10)
          }
        })
    }
  }

  handleEditActivityButton = () => {
    const {documentInfo} = this.state
    if (documentInfo && documentInfo.portalEditUrl) {
      window.location.href = documentInfo.portalEditUrl
    }
  }

  handleSupportToggle = () => {
    this.setState({showSupportsDropdown: !this.state.showSupportsDropdown})
  }

  handleSupportDropdownItemClicked = (supportId:string) => {
    const {visibleSupportIds, supportsSeen, supports} = this.state
    const {supportsSeenRef} = this.props
    const {logManager} = this.props
    const support = (supports && supports[supportId]) || ({} as Support)
    if (visibleSupportIds.indexOf(supportId) === -1) {
      if (logManager) {
        logManager.logEvent("Opened support item", supportId, {
          supportId: supportId,
          text: support.text,
          createdAt: support.createdAt
        })
      }
      visibleSupportIds.unshift(supportId)
      if (supportsSeenRef && (!supportsSeen || !supportsSeen[supportId])) {
        supportsSeenRef.child(supportId).set(firebase.database.ServerValue.TIMESTAMP)
      }
      this.setState({visibleSupportIds})
    }
  }

  handleCloseVisibleSupportItem = (supportId:string) => {
    const {visibleSupportIds, supports} = this.state
    const {logManager} = this.props
    const index = visibleSupportIds.indexOf(supportId)
    const support = (supports && supports[supportId]) || ({} as Support)
    if (index !== -1) {
      if (logManager) {
        logManager.logEvent("Closed support item", supportId, {
          supportId: supportId,
          text: support.text,
          createdAt: support.createdAt
        })
      }
      visibleSupportIds.splice(index, 1)
      this.setState({visibleSupportIds})
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
          {this.props.setTitle ? <InlineEditorComponent text={documentInfo.name} changeText={this.handleChangeDocumentName} /> : documentInfo.name}
        </div>
        <div className="instance-info" title={this.state.debugInfo}>{this.state.workspaceName}</div>
      </div>
    )
  }

  renderVisibleSupport(supports: FirebaseSupportMap, supportId:string) {
    const support = supports[supportId]
    if (!support) {
      return null
    }
    return (
      <div className="visible-support" key={supportId}>
        <div className="visible-support-close" onClick={() => this.handleCloseVisibleSupportItem(supportId) }>X</div>
        <span className="visible-support-icon">?</span>
        {this.renderSupportText(support)}
      </div>
    )
  }

  renderVisibleSupports() {
    const {visibleSupportIds, supports} = this.state
    if (!supports || (visibleSupportIds.length === 0)) {
      return null
    }
    return (
      <div className="visible-supports">
        {visibleSupportIds.map((supportId) => this.renderVisibleSupport(supports, supportId))}
      </div>
    )
  }

  renderSupportText(support:Support) {
    let text = support.text
    if (support.type) {
      text = `${SupportTypeStrings[support.type]}: ${text}`.replace("?:", "?")
    }
    return text
  }

  renderSupportDropdownItem(supports: FirebaseSupportMap, supportId:string) {
    const support = supports[supportId]
    if (!support) {
      return null
    }
    const newSupport = !this.state.supportsSeen || !this.state.supportsSeen[supportId]
    return (
      <div className="supports-dropdown-item" key={supportId} onClick={() => this.handleSupportDropdownItemClicked(supportId)}>
        {newSupport ? <div className="supports-dropdown-item-new" /> : null}
        {this.renderSupportText(support)}
      </div>
    )
  }

  renderSupportsDropdown(supports: FirebaseSupportMap, supportKeys:string[]) {
    if (supportKeys.length === 0) {
      return null
    }
    return (
      <div className="supports-dropdown">
        {supportKeys.map((supportId) => this.renderSupportDropdownItem(supports, supportId))}
      </div>
    )
  }

  renderSupportsIcon() {
    const {supports, supportsSeen, showSupportsDropdown} = this.state
    const supportKeys = supports ? Object.keys(supports) : []
    if (!supports || supportKeys.length === 0) {
      return null
    }
    let numUnseen = 0;
    supportKeys.forEach((supportId) => {
      if (!supportsSeen || !supportsSeen[supportId]) {
        numUnseen++
      }
    })
    return (
      <div className="supports" onClick={this.handleSupportToggle}>
        <div className="supports-icon-large">?</div>
        {numUnseen > 0 ? <div className="supports-icon-count">{numUnseen}</div> : null}
        {showSupportsDropdown ? this.renderSupportsDropdown(supports, supportKeys) : null}
      </div>
    )
  }

  renderGroupInfo() {
    const {portalOffering} = this.props
    const {groupUsers} = this.state
    if (!groupUsers || !portalOffering) {
      return null
    }
    const users:JSX.Element[] = []
    Object.keys(groupUsers).forEach((id) => {
      const groupUser = groupUsers[id]
      const portalUser = this.userLookup.lookup(id)
      if (portalUser) {
        const {connected} = groupUser
        const className = `group-user ${groupUser.connected ? `connected ${portalUser.type}` : "disconnected"}`
        const titleSuffix = groupUser.connected ? `connected` : `disconnected`
        users.push(<div key={id} className={className} title={`${portalUser.fullName}: ${titleSuffix}`}>{portalUser.initials}</div>)
      }
    })
    return (
      <div className="group-info"><div className="group-name clickable" onClick={this.handlePromptToChangeGroup} title="Click to leave group">Group {this.props.group}</div>{users}</div>
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
          <div className="user-name" title={firebaseUser.uid}>{userName}</div>
        </div>
        {this.renderGroupInfo()}
        {this.renderSupportsIcon()}
      </div>
    )
  }

  renderPublicationToolbar() {
    const { publication } = this.props
    if (!publication) {
      return null
    }
    const {creator, createdAt} = publication
    const user = this.userLookup.lookup(creator)
    const name = user ? user.fullName : "Unknown User"
    return (
      <div className="buttons">
        <div className="left-buttons">
          <div className="readonly-message">
            Published <LiveTimeAgoComponent timestamp={createdAt} /> by {name} in group {publication.group}
          </div>
        </div>
        <div className="right-buttons">
          <button type="button" onClick={this.handleViewAllPublications}>View All Publications</button>
        </div>
      </div>
    )
  }

  renderReadonlyTemplateToolbar() {
    return (
      <div className="readonly-message">View only.  You do not have edit access to this template.</div>
    )
  }

  renderReadonlyToolbar() {
    return this.props.isTemplate ? this.renderReadonlyTemplateToolbar() : this.renderPublicationToolbar()
  }

  renderToolbarButtons() {
    const {document} = this.props
    const {documentInfo} = this.state
    const showCreateActivityButton = documentInfo && documentInfo.portalUrl && !documentInfo.portalEditUrl && !document.isReadonly
    const showEditActivityButton = documentInfo && documentInfo.portalUrl && documentInfo.portalEditUrl && !document.isReadonly && this.props.isTemplate
    const editActivityUrl = documentInfo && documentInfo.portalEditUrl
    const showDemoButton = this.props.isTemplate && !document.isReadonly
    const showPublishButton = !this.props.isTemplate && !document.isReadonly
    return (
      <div className="buttons">
        <div className="left-buttons">
          <button type="button" onClick={this.handleAddDrawingButton}><i className="icon icon-pencil" /> Add Drawing</button>
          <button type="button" onClick={this.handleUploadImageButton}><i className="icon icon-file-picture" /> Upload Image</button>
          <button type="button" onClick={this.handleAddCaseTable}><i className="icon icon-table2" /> Add Table</button>
          <button type="button" onClick={this.handleAddGraph}><i className="icon icon-stats-dots" /> Add Graph</button>
          </div>
        <div className="right-buttons">
          {showCreateActivityButton ? <button type="button" onClick={this.handleCreateActivityButton}>Create Portal Activity</button> : null}
          {showEditActivityButton && editActivityUrl ? <a className="button" href={editActivityUrl} target="_blank">Edit Portal Activity</a> : null}
          {showDemoButton ? <button type="button" onClick={this.handleCreateDemoButton}>Create Demo</button> : null}
          {showPublishButton ? <button type="button" disabled={this.state.publishing} onClick={this.handlePublishButton}><i className="icon icon-newspaper" /> Publish All</button> : null}
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
    const userId = this.userId()
    const nonPrivateWindows = allOrderedWindows.filter((orderedWindow: OrderedWindow) => this.nonPrivateWindow({window: orderedWindow.window}))
    return nonPrivateWindows.map((orderedWindow) => {
      const {window} = orderedWindow
      return <WindowComponent
               key={window.id}
               window={window}
               isTopWindow={window === topWindow}
               zIndex={orderedWindow.order}
               windowManager={this.windowManager}
               isTemplate={this.props.isTemplate}
               isReadonly={this.props.document.isReadonly}
               publishWindow={this.handlePublish}
               copyWindow={this.handleCopy}
             />
    })
  }

  renderMinimizedWindows() {
    const nonPrivateWindows = this.state.minimizedWindows.filter((window) => this.nonPrivateWindow({window}))
    const windows = nonPrivateWindows.map((window) => {
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
    const className = `window-area${!this.props.isTemplate && !this.props.document.isReadonly ? " with-sidebar" : ""}`
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
    if (this.props.isTemplate && this.props.document.isReadonly) {
      return <div className="readonly-blocker" />
    }
    return null
  }

  renderSidebarComponent() {
    const {portalOffering, portalUser, portalTokens, group} = this.props
    if (!portalOffering || !portalUser || !portalTokens || !group) {
      return null
    }
    return <SidebarComponent
             portalOffering={portalOffering}
             portalUser={portalUser}
             portalTokens={portalTokens}
             group={group}
             toggleViewArtifact={this.handleToggleViewArtifact}
             publishing={this.state.publishing}
             windowManager={this.windowManager}
           />
  }

  renderArtifact() {
    if (!this.state.viewArtifact) {
      return null
    }
    return (
      <div className="image-lightbox" onClick={this.handleClearViewArtifact}>
        <div className="image-lightbox-background" />
        <div className="image-lightbox-image">
          <div>
            <img src={this.state.viewArtifact.url} draggable={false} />
          </div>
        </div>
      </div>
    )
  }

  renderModalDialog() {
    let titlebar = ""
    let title = ""
    let okButton = ""
    let content:JSX.Element|null = null
    let newWindowIsPrivate:HTMLInputElement|null
    let enableVisibiltyOptions = !this.props.isTemplate

    const handleOk = () => {
      const {onModalOk} = this.state
      if (onModalOk) {
        let newTitle = this.modalDialogNewWindowTitle ? this.modalDialogNewWindowTitle.value.trim() : ""
        if (newTitle.length == 0) {
          newTitle = title
        }
        const ownerId = newWindowIsPrivate && newWindowIsPrivate.checked ? this.userId() : null
        onModalOk(newTitle, ownerId)
        this.setState({showModal: null})
      }
    }

    const handleOnKeyDown = (e:React.KeyboardEvent<HTMLInputElement>) => {
      if (e.keyCode === 13) {
        handleOk()
      }
    }

    const handleCancel = () => {
      this.setState({showModal: null})
    }

    switch (this.state.showModal) {
      case "copy":
        title = this.state.copyWindow ? `Copy of ${this.state.copyWindow.attrs.title}` : ""
        titlebar = "Copy Window"
        okButton = "Copy"
        break
      case "add-drawing":
        title = "Untitled Drawing"
        titlebar = "Add Drawing"
        okButton = "Add"
        break
      case "add-table":
        title = "Untitled Table"
        titlebar = "Add Table"
        okButton = "Add"
        enableVisibiltyOptions = false
        break
      case "add-graph":
        title = "Untitled Graph"
        titlebar = "Add Graph"
        okButton = "Add"
        enableVisibiltyOptions = false
        break
    }

    let visibilityGroup:JSX.Element|null = null
    if (enableVisibiltyOptions) {
      visibilityGroup = (
        <div className="form-group">
          <label htmlFor="windowType">Visibility</label>
          <input type="radio" name="windowType" value="public" defaultChecked /> Public
          <input type="radio" name="windowType" value="private" ref={(el) => newWindowIsPrivate = el} /> Private
        </div>
      )
    }

    return (
      <div className="modal-dialog">
        <div className="modal-dialog-title">{titlebar}</div>
        <div className="modal-dialog-content">
          <div className="modal-dialog-inner-content">
            <div className="form-group">
              <label htmlFor="windowTitle">Name</label>
              <input id="windowTitle" type="text" placeholder="New name of window" defaultValue={title} ref={(el) => this.modalDialogNewWindowTitle = el} onKeyDown={handleOnKeyDown} />
            </div>

            {visibilityGroup}

            <div className="form-group" style={{textAlign: "right"}} >
              <button onClick={handleOk}>{okButton}</button>
              <button onClick={handleCancel}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  renderModal() {
    if (!this.state.showModal) {
      return null
    }
    return (
      <div className="modal" onClick={this.handleClearViewArtifact}>
        <div className="modal-background" />
        <div className="modal-dialog-container">
          {this.renderModalDialog()}
        </div>
      </div>
    )
  }

  renderUploadImageDialog() {
    if (!this.state.showUploadImageDialog) {
      return null
    }
    return <UploadImageDialogComponent
              offering={this.props.portalOffering}
              onAddUploadedImage={this.handleAddUploadedImage}
              onCancelUploadedImage={this.handleHideUploadImageDialog}
              enableVisibilityOptions={!this.props.isTemplate}
            />
  }

  render() {
    return (
      <div className="workspace" onDrop={this.handleDrop} onDragOver={this.handleDragOver}>
        {this.renderHeader()}
        {this.renderToolbar()}
        {this.renderWindowArea()}
        {this.renderVisibleSupports()}
        {this.renderSidebarComponent()}
        {this.renderArtifact()}
        {this.renderModal()}
        {this.renderUploadImageDialog()}
        {this.renderReadonlyBlocker()}
      </div>
    )
  }
}