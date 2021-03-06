import * as React from "react"
import * as firebase from "firebase"
import * as queryString from "query-string"
import * as superagent from "superagent"

import { FirebaseDocumentInfo, Document, FirebasePublication, FirebaseArtifact, FirebasePublicationWindowMap, FirebaseDocument } from "../lib/document"
import { Window, FirebaseWindowAttrs, FirebaseWindowAttrsMap, FirebaseAnnotationMap, Annotation, PathAnnotationPoint } from "../lib/window"
import { WindowComponent, CaptureAnnotationCallbackMap } from "./window"
import { MinimizedWindowComponent } from "./minimized-window"
import { InlineEditorComponent } from "./inline-editor"
import { SidebarComponent } from "./sidebar"
import { WindowManager, WindowManagerState, DragType, OrderedWindow, AddWindowLogParams } from "../lib/window-manager"
import { v4 as uuidV4} from "uuid"
import { PortalUser, PortalOffering, PortalUserConnectionStatusMap, PortalUserConnected, PortalUserDisconnected, PortalTokens, AuthQueryParams } from "../lib/auth"
import { AppHashParams } from "./app"
import escapeFirebaseKey from "../lib/escape-firebase-key"
import { getDocumentPath, getPublicationsRef, getArtifactsPath, getPublicationsPath, getArtifactsStoragePath, getSnapshotStoragePath, getFavoritesRef, getPosterAnnotationsRef, getRelativeRefPath } from "../lib/refs"
import { WorkspaceClientPublishRequest, WorkspaceClientPublishRequestMessage } from "../../../shared/workspace-client"
import { UserLookup } from "../lib/user-lookup"
import { Support, SupportTypeStrings, FirebaseSupportMap, FirebaseSupportSeenUsersSupportMap } from "./dashboard-support"
import { LogManager } from "../../../shared/log-manager"
import { merge } from "lodash"
import { LiveTimeAgoComponent } from "./live-time-ago"
import { UploadImageDialogComponent } from "./upload-image-dialog"
import { LearningLogComponent } from "./learning-log"
import { listDataSetsInDocument, WorkspaceDataSet } from "../lib/list-datasets"

export const getPosterViewUrl = (portalTokens: PortalTokens|null, portalUser: PortalUser|null, portalOffering: PortalOffering|null, template?: string) => {
  if (portalTokens) {
    const queryParams = queryString.parse(window.location.search)
    const urlParams:any = {
      portalJWT: portalTokens.rawPortalJWT,
      group: "poster"
    }
    if (queryParams.demo) {
      urlParams.demo = queryParams.demo
    }
    if (queryParams.drawingImageSet) {
      urlParams.drawingImageSet = queryParams.drawingImageSet
    }
    if (portalOffering && portalUser && (portalUser.type === "teacher")) {
      urlParams.classInfoUrl = portalOffering.classInfoUrl
      urlParams.offeringId = portalOffering.id
    }
    const hashParams = queryString.parse(window.location.hash)
    if (template) {
      hashParams.template = template
    }
    return `index.html?${queryString.stringify(urlParams)}#${queryString.stringify(hashParams)}`
  }
}

export type PublicationWindowOptions = PublicationWindowOptionsByOffering | PublicationWindowOptionsByClass

export interface PublicationWindowOptionsByOffering {
  type: "offering"
  offering: PortalOffering
  publicationId: string
  windowId: string
  documentId: string
}

export interface PublicationWindowOptionsByClass {
  type: "class"
  classHash: string
  publicationId: string
  windowId: string
  documentId: string
}

export interface AddWindowLogParamsParams {
  ownerId?: string
  copiedFrom?: string
}

export interface NonPrivateWindowParams {
  window?: Window
  ownerId?: string
}

export interface ModalWindowOptions {
  type: "copy"|"add-drawing"|"add-table"|"add-graph"|"add-snapshot"|"copy-into-document"|"copy-into-poster",
  title?: string
  onOk?: (title: string, ownerId?:string) => void
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
  group: string|null
  leaveGroup?: () => void
  publication: FirebasePublication|null
  logManager: LogManager|null
  posterDocument?: Document
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
  modalWindowOptions: ModalWindowOptions|null
  showUploadImageDialog: boolean
  showLearningLog: boolean
  progressMessage: string|null
  captureAnnotationsCallbacks: CaptureAnnotationCallbackMap
  isReadonly: boolean
  posterView: {
    enabled: boolean
    editable: boolean
  }
  posterAnnotations: FirebaseAnnotationMap
  currentPosterAnnotation: Annotation|null
  annotatingPoster: boolean
  windowWidth: number
}

interface WorkspaceHeaderRefs {
  userInfoRef: HTMLDivElement|null
  groupInfoRef: HTMLDivElement|null
  supportsRef: HTMLDivElement|null
}

export class WorkspaceComponent extends React.Component<WorkspaceComponentProps, WorkspaceComponentState> {
  infoRef: firebase.database.Reference
  connectedRef: firebase.database.Reference|null
  userRef: firebase.database.Reference|null
  groupUsersRef: firebase.database.Reference|null
  posterAnnotationsRef: firebase.database.Reference|null
  windowManager: WindowManager
  userOnDisconnect: firebase.database.OnDisconnect|null
  userLookup: UserLookup
  modalDialogNewWindowTitle: HTMLInputElement|null
  posterAnnotationsElement: HTMLDivElement|null
  headerRefs: WorkspaceHeaderRefs = {
    userInfoRef: null,
    groupInfoRef: null,
    supportsRef: null
  }

  constructor (props:WorkspaceComponentProps) {
    super(props)

    const {portalOffering, group, portalUser, document} = props

    this.userLookup = new UserLookup(portalOffering ? portalOffering.classInfo : undefined)

    const posterView = {
      enabled: group === "poster",
      editable: !!(portalUser && (portalUser.type === "teacher"))
    }

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
      modalWindowOptions: null,
      showUploadImageDialog: false,
      showLearningLog: false,
      progressMessage: null,
      captureAnnotationsCallbacks: {},
      isReadonly: (props.isTemplate && document.isReadonly) || (posterView.enabled && !posterView.editable),
      posterView,
      posterAnnotations: {},
      currentPosterAnnotation: null,
      annotatingPoster: false,
      windowWidth: 0
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
      syncChanges: this.props.isTemplate || this.state.posterView.enabled,
      user: this.props.portalUser,
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

    const {portalOffering, group} = this.props
    if (portalOffering && (group === "poster")) {
      this.posterAnnotationsRef = getPosterAnnotationsRef(portalOffering)
      this.posterAnnotationsRef.on("child_added", this.handlePosterAnnotationChildAdded)
      this.posterAnnotationsRef.on("child_removed", this.handlePosterAnnotationChildRemoved)
    }
  }

  componentDidMount() {
    window.addEventListener("resize", this.handleResize, false)
    this.handleResize()
  }

  handleResize = () => {
    this.setState({windowWidth: window.innerWidth})
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
    window.removeEventListener("resize", this.handleResize, false)

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

    if (this.posterAnnotationsRef) {
      this.posterAnnotationsRef.off("child_added", this.handlePosterAnnotationChildAdded)
      this.posterAnnotationsRef.off("child_removed", this.handlePosterAnnotationChildRemoved)
    }
  }

  userId() {
    return this.props.portalUser ? this.props.portalUser.id: this.props.firebaseUser.uid
  }

  nonPrivateWindow = (params: NonPrivateWindowParams) => {
    const ownerId = params.ownerId || (params.window ? params.window.attrs.ownerId : undefined)
    return !ownerId || (ownerId === this.userId())
  }

  handlePosterAnnotationChildAdded = (snapshot:firebase.database.DataSnapshot) => {
    const {portalUser} = this.props
    const annotation:Annotation|null = snapshot.val()
    if (annotation && snapshot.key) {
      const {posterAnnotations} = this.state
      posterAnnotations[snapshot.key] = annotation
      this.setState({posterAnnotations})
    }
  }

  handlePosterAnnotationChildRemoved = (snapshot:firebase.database.DataSnapshot) => {
    const {portalUser} = this.props
    const annotation:Annotation|null = snapshot.val()
    if (annotation && snapshot.key) {
      const {posterAnnotations} = this.state
      delete posterAnnotations[snapshot.key]
      this.setState({posterAnnotations})
    }
  }

  handleToggleAnnotatePoster = () => {
    const {annotatingPoster} = this.state
    this.setState({annotatingPoster: !annotatingPoster})
  }

  handleClearPosterAnnotations = () => {
    const {posterAnnotationsRef} = this
    if (posterAnnotationsRef && confirm("Are you sure you want to clear the poster annotations?")) {
      posterAnnotationsRef.set(null)
    }
  }

  handlePosterAnnotationMouseDown = (e:React.MouseEvent<HTMLDivElement>) => {
    const {posterAnnotationsElement, posterAnnotationsRef} = this
    if (!posterAnnotationsElement || !posterAnnotationsRef) {
      return
    }
    const boundingRect = posterAnnotationsElement.getBoundingClientRect()

    const annotation:Annotation = {type: "path", id: uuidV4(), points: []}
    const getPoint = (e:React.MouseEvent<HTMLDivElement>|MouseEvent) => {
      return {x: e.clientX - boundingRect.left, y: e.clientY - boundingRect.top}
    }
    const startPoint:PathAnnotationPoint = getPoint(e)
    const handleDrawMove = (e:MouseEvent) => {
      if (annotation.points.length === 0) {
        annotation.points.push(startPoint)
      }
      annotation.points.push(getPoint(e))
      this.setState({currentPosterAnnotation: annotation})
    }
    const handleDrawDone = (e:MouseEvent) => {
      if (annotation.points.length > 0) {
        posterAnnotationsRef.push(annotation)
      }
      this.setState({currentPosterAnnotation: null})

      window.removeEventListener("mousemove", handleDrawMove)
      window.removeEventListener("mouseup", handleDrawDone)
    }
    window.addEventListener("mousemove", handleDrawMove)
    window.addEventListener("mouseup", handleDrawDone)
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

    // take off trailing html file if it exists
    const parts = location.pathname.split("/")
    const last = parts.pop() || ""
    if (last.indexOf(".html") === -1) {
      parts.push(last)
    }
    else if (parts.length === 1) {
      parts.push("")
    }

    return `${location.origin}${parts.join("/")}${filename}`
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
      modalWindowOptions: {
        type: "add-drawing",
        onOk: (title, ownerId) => {
          this.windowManager.add({
            url: this.constructRelativeUrl("drawing-tool-v2.html"),
            title,
            ownerId,
            log: {name: "Added drawing window", params: this.getAddWindowLogParams({ownerId})}
          })
        }
      }
    })
  }

  handleAddCaseTable = () => {
    this.setState({
      modalWindowOptions: {
        type: "add-table",
        onOk: (title, ownerId) => {
          this.windowManager.add({
            url: this.constructRelativeUrl("neo-codap.html?mode=table"),
            title,
            ownerId,
            createNewDataSet: true,
            log: {name: "Added table window", params: this.getAddWindowLogParams({ownerId})}
          })
        }
      }
    })
  }

  handleAddGraph = () => {
    const {document, portalUser} = this.props
    const cancelListDataSets = listDataSetsInDocument({document, user: portalUser, includePrivate: true, callback: (dataSets: WorkspaceDataSet[]) => {
      cancelListDataSets()

      let title:string|undefined = undefined
      if (dataSets.length > 0) {
        title = `Untitled Graph for ${dataSets.map((dataSet) => dataSet.name).join(" or ")}`
      }

      this.setState({
        modalWindowOptions: {
          title,
          type: "add-graph",
          onOk: (title, ownerId) => {
            this.windowManager.add({
              url: this.constructRelativeUrl("neo-codap.html?mode=graph"),
              title,
              ownerId,
              log: {name: "Added graph window", params: this.getAddWindowLogParams({ownerId})}
            })
          }
        }
      })
    }})
  }

  handleCreateDemoButton = () => {
    // name the class so the fake "my classes" endpoint works
    const demoId = uuidV4()
    const {documentInfo} = this.state
    if (documentInfo) {
      const now = new Date()
      const className = `${documentInfo.name}: ${now.toDateString()}`
      firebase.database().ref("demo/classNames").child(demoId).set(className)
    }
    const hashParams:AppHashParams = {
      template: this.props.document.getTemplateHashParam(),
      demo: demoId
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

  handleFilterCurrentUserAnnotations(firebaseDocument:FirebaseDocument, userId:string) {
    if (firebaseDocument.data && firebaseDocument.data.windows && firebaseDocument.data.windows.annotations) {
      const annotationsWindowMap = firebaseDocument.data.windows.annotations
      Object.keys(annotationsWindowMap).forEach((windowId) => {
        const annotations = annotationsWindowMap[windowId]
        if (annotations) {
          const filteredAnnotations:FirebaseAnnotationMap = {}
          Object.keys(annotations).forEach((id) => {
            const annotation = annotations[id]
            if (!annotation.userId || (annotation.userId === userId)) {
              annotation.userId = null
              filteredAnnotations[id] = annotation
            }
          })
          annotationsWindowMap[windowId] = filteredAnnotations
        }
      })
    }
  }

  handleCopy = (copyWindow:Window) => {
    this.setState({
      modalWindowOptions: {
        type: "copy",
        title: `Copy of ${copyWindow.attrs.title}`,
        onOk: (title, ownerId) => {
          this.windowManager.copyWindow(copyWindow, title, ownerId)
        }
      }
    })
  }

  handleToggleLearningLogButton = () => {
    this.setState({showLearningLog: !this.state.showLearningLog})
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

    const filterDocument = (firebaseDocument:FirebaseDocument) => {
      const {portalUser} = this.props
      this.handleSyncLocalWindowState(firebaseDocument)
      if (portalUser) {
        this.handleFilterCurrentUserAnnotations(firebaseDocument, portalUser.id)
      }
    }

    // copy the doc with local window state
    this.props.document.copy(getDocumentPath(portalOffering), filterDocument)
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
                if (windowIdsToPublish.indexOf(windowId) === -1) {
                  windowIdsToPublish.push(windowId)
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
                artifactStoragePath: getArtifactsStoragePath(portalOffering, publicationId),
                annotationImageDataUrl: null
              }

              const windowsToPublish:Window[] = []
              const annotationImagePromises:Promise<string|null>[] = []
              windowIdsToPublish.forEach((windowId) => {
                const window = this.windowManager.getWindow(windowId)
                if (window) {
                  windowsToPublish.push(window)
                  annotationImagePromises.push(this.captureAnnotationImage(window))
                }
              })

              Promise.all(annotationImagePromises)
                .then((annotationImages) => {
                  windowIdsToPublish.forEach((windowId, index) => {
                    const windowPublishRequest = merge({}, publishRequest, {annotationImageDataUrl: annotationImages[index]})
                    this.windowManager.postToWindow(
                      windowsToPublish[index],
                      WorkspaceClientPublishRequestMessage,
                      windowPublishRequest,
                      "Workspace#handlePublish"
                    )
                  })
                })
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

  handleSnapshot = (window:Window) => {
    const {portalOffering} = this.props
    if (!portalOffering) {
      return
    }

    this.setState({progressMessage: "Taking snapshot..."})

    this.captureAnnotationImage(window)
      .then((annotationImageDataUrl) => {
        const snapshotId = uuidV4()
        const snapshotsPath = getSnapshotStoragePath(portalOffering, snapshotId)

        this.windowManager.snapshotWindow(window, snapshotsPath, annotationImageDataUrl)
          .then((snapshotUrl) => {
            this.setState({
              progressMessage: null,
              modalWindowOptions: {
                type: "add-snapshot",
                onOk: (title, ownerId) => {
                  this.windowManager.add({
                    url: this.constructRelativeUrl(`drawing-tool-v2.html?backgroundUrl=${encodeURIComponent(snapshotUrl)}`),
                    title,
                    ownerId,
                    log: {name: "Added snapshot drawing window", params: this.getAddWindowLogParams({ownerId})}
                  })
                }
              }
            })
          })
          .catch((err:any) => {
            alert(err.toString())
            this.setState({progressMessage: null})
          })
      })
  }

  captureAnnotationImage(window: Window) {
    return new Promise<string|null>((resolve, reject) => {
      const {captureAnnotationsCallbacks} = this.state
      captureAnnotationsCallbacks[window.id] = (err, imageDataUrl) => {
        delete captureAnnotationsCallbacks[window.id]
        this.setState({captureAnnotationsCallbacks})
        resolve(err ? null : imageDataUrl)
      }
      this.setState({captureAnnotationsCallbacks})
    })
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

  handleToggleFavorite = (options: PublicationWindowOptions) => {
    const {portalUser, portalOffering} = this.props
    if (portalUser && portalOffering) {
      const {publicationId, windowId} = options
      let ref: firebase.database.Reference
      if (options.type === "offering") {
        ref = getFavoritesRef(options.offering.domain, options.offering.classInfo.classHash, portalUser.id, publicationId, windowId)
      }
      else {
        ref = getFavoritesRef(portalOffering.domain, options.classHash, portalUser.id, publicationId, windowId)
      }
      ref.once("value", (snapshot) => {
        ref.set(snapshot.val() ? null : true)
      })
    }
  }

  handleCopyIntoDocument = (options: PublicationWindowOptions, title: string) => {
    const {portalOffering} = this.props
    if (portalOffering) {
      this.setState({
        modalWindowOptions: {
          type: "copy-into-document",
          title,
          onOk: (title, ownerId) => {
            this.windowManager.copyWindowFromPublication(portalOffering, options, title, ownerId)
              .catch((err:any) => alert(err.toString()))
          }
        }
      })
    }
  }

  handleCopyIntoPoster = (options: PublicationWindowOptions, title: string) => {
    const {portalOffering, posterDocument} = this.props
    if (portalOffering && posterDocument) {
      this.setState({
        modalWindowOptions: {
          type: "copy-into-poster",
          title,
          onOk: (title, ownerId) => {
            this.windowManager.copyWindowFromPublication(portalOffering, options, title, ownerId, posterDocument)
              .catch((err:any) => alert(err.toString()))
          }
        }
      })
    }
  }

  renderDocumentInfo() {
    const {documentInfo, windowWidth} = this.state
    if (!documentInfo) {
      return null
    }
    const {userInfoRef, groupInfoRef, supportsRef} = this.headerRefs
    let infoWidth: number|string = "auto"
    if (windowWidth !== 0) {
      const userInfoWidth = userInfoRef ? userInfoRef.offsetWidth + 25 : 0
      const groupInfoWidth = groupInfoRef ? groupInfoRef.offsetWidth + 25 : 0
      const supportsWidth = supportsRef ? supportsRef.offsetWidth + 25 : 0
      infoWidth = Math.max(0, windowWidth - supportsWidth - groupInfoWidth - userInfoWidth)
    }
    return (
      <div className="document-info" style={{width: infoWidth}}>
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
      <div className="supports" onClick={this.handleSupportToggle} ref={(el) => this.headerRefs.supportsRef = el}>
        <div className="supports-icon-large">?</div>
        {numUnseen > 0 ? <div className="supports-icon-count">{numUnseen}</div> : null}
        {showSupportsDropdown ? this.renderSupportsDropdown(supports, supportKeys) : null}
      </div>
    )
  }

  renderGroupInfo() {
    const {posterView} = this.state
    const {portalOffering, group} = this.props

    if (posterView.enabled) {
      return (
        <div className="group-info" ref={(el) => this.headerRefs.groupInfoRef = el}><div className="group-name"><i className="icon icon-map2" /> Poster View</div></div>
      )
    }
    else {
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
        <div className="group-info" ref={(el) => this.headerRefs.groupInfoRef = el}>
          <div className="group-name clickable" onClick={this.handlePromptToChangeGroup} title="Click to leave group">Group {this.props.group}</div>{users}
        </div>
      )
    }
  }

  renderHeader() {
    const {firebaseUser, portalUser, group} = this.props
    const {posterView} = this.state
    const className = `header${this.props.isTemplate ? " template" : (posterView.enabled ? " poster" : "")}`
    const userName = portalUser ? portalUser.fullName : (firebaseUser.isAnonymous ? "Anonymous User" : firebaseUser.displayName)
    return (
      <div className={className}>
        {this.renderDocumentInfo()}
        <div className="user-info" ref={(el) => this.headerRefs.userInfoRef = el}>
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

  renderReadonlyToolbar() {
    if (this.state.posterView.enabled) {
      return <div className="readonly-message">View only.  Only teachers can edit the poster.</div>
    }
    if (this.props.isTemplate) {
      return <div className="readonly-message">View only.  You do not have edit access to this template.</div>
    }
    return this.renderPublicationToolbar()
  }

  renderLeftToolbarButtons() {
    return (
      <div className="left-buttons">
        <button type="button" onClick={this.handleAddDrawingButton}><i className="icon icon-pencil" /> Add Drawing</button>
        <button type="button" onClick={this.handleUploadImageButton}><i className="icon icon-file-picture" /> Upload Image</button>
        <button type="button" onClick={this.handleAddCaseTable}><i className="icon icon-table2" /> Add Table</button>
        <button type="button" onClick={this.handleAddGraph}><i className="icon icon-stats-dots" /> Add Graph</button>
      </div>
    )
  }

  renderToolbarButtons() {
    const {document, group, portalUser, portalTokens, portalOffering} = this.props
    const {documentInfo, isReadonly, posterView, annotatingPoster} = this.state
    const isTeacher = portalUser && (portalUser.type === "teacher")
    const showLeftButtons = !isReadonly && (!posterView.enabled || (isTeacher && !annotatingPoster))
    const showCreateActivityButton = documentInfo && documentInfo.portalUrl && !documentInfo.portalEditUrl && !isReadonly
    const showEditActivityButton = documentInfo && documentInfo.portalUrl && documentInfo.portalEditUrl && !isReadonly && this.props.isTemplate
    const editActivityUrl = documentInfo && documentInfo.portalEditUrl
    const showDemoButton = this.props.isTemplate && !isReadonly
    const showPublishButton = !posterView.enabled && !this.props.isTemplate && !isReadonly
    const showLearningLogButton = !this.props.isTemplate && (!posterView.enabled || isTeacher)
    const showPosterViewButton = !posterView.enabled
    const posterViewUrl = showPosterViewButton ? getPosterViewUrl(portalTokens, portalUser, portalOffering) : null

    return (
      <div className="buttons">
        {showLeftButtons ? this.renderLeftToolbarButtons() : null}
        <div className="right-buttons">
          {showCreateActivityButton ? <button type="button" onClick={this.handleCreateActivityButton}>Create Portal Activity</button> : null}
          {showEditActivityButton && editActivityUrl ? <a className="button" href={editActivityUrl} target="_blank">Edit Portal Activity</a> : null}
          {showDemoButton ? <button type="button" onClick={this.handleCreateDemoButton}>Create Demo</button> : null}
          {showLearningLogButton && !annotatingPoster ? <button type="button" onClick={this.handleToggleLearningLogButton}><i className="icon icon-profile" /> Open Artifacts Archive</button> : null}
          {posterView.enabled && isTeacher ? <button type="button" onClick={this.handleToggleAnnotatePoster}><i className="icon icon-stack" /> {annotatingPoster ? "Stop" : "Start"} Annotating Poster</button> : null}
          {annotatingPoster ? <button type="button" onClick={this.handleClearPosterAnnotations}><i className="icon icon-cross" /> Clear Poster Annotations</button> : null}
          {showPosterViewButton && posterViewUrl ? <a className="button" href={posterViewUrl} target="_blank"><i className="icon icon-map2" /> Open Poster View</a> : null}
          {showPublishButton ? <button type="button" disabled={this.state.publishing} onClick={this.handlePublishButton}><i className="icon icon-newspaper" /> Publish All</button> : null}
        </div>
      </div>
    )
  }

  renderToolbar() {
    return (
      <div className="toolbar">
        {this.state.isReadonly ? this.renderReadonlyToolbar() : this.renderToolbarButtons()}
      </div>
    )
  }

  renderAllWindows() {
    const {allOrderedWindows, topWindow, captureAnnotationsCallbacks, isReadonly, posterView} = this.state
    const {document, isTemplate, portalUser} = this.props
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
               isTemplate={isTemplate}
               isReadonly={isReadonly}
               publishWindow={this.handlePublish}
               copyWindow={this.handleCopy}
               snapshotWindow={this.handleSnapshot}
               annotationsRef={document.getWindowsDataRef("annotations").child(window.id)}
               portalUser={portalUser}
               captureAnnotationsCallback={captureAnnotationsCallbacks[window.id]}
               inPosterView={posterView.enabled}
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
    const className = `window-area${!this.props.isTemplate && !this.state.isReadonly ? " with-sidebar" : ""}`
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
    if (this.state.isReadonly) {
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
             toggleFavorite={this.handleToggleFavorite}
             copyIntoDocument={this.handleCopyIntoDocument}
             copyIntoPoster={this.handleCopyIntoPoster}
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
    const {modalWindowOptions} = this.state
    if (!modalWindowOptions) {
      return null
    }

    let titlebar = ""
    let title = modalWindowOptions.title || ""
    let okButton = ""
    let content:JSX.Element|null = null
    let newWindowIsPrivate:HTMLInputElement|null
    let enableVisibiltyOptions = !this.props.isTemplate

    const handleOk = () => {
      const {onOk} = modalWindowOptions
      if (onOk) {
        let newTitle = this.modalDialogNewWindowTitle ? this.modalDialogNewWindowTitle.value.trim() : ""
        if (newTitle.length == 0) {
          newTitle = title
        }
        const ownerId = newWindowIsPrivate && newWindowIsPrivate.checked ? this.userId() : undefined
        onOk(newTitle, ownerId)
        this.setState({modalWindowOptions: null})
      }
    }

    const handleOnKeyDown = (e:React.KeyboardEvent<HTMLInputElement>) => {
      if (e.keyCode === 13) {
        handleOk()
      }
    }

    const handleCancel = () => {
      this.setState({modalWindowOptions: null})
    }

    switch (modalWindowOptions.type) {
      case "copy-into-document":
        titlebar = "Copy Into Your Document"
        okButton = "Copy"
        break
      case "copy-into-poster":
        titlebar = "Copy Into Poster View"
        okButton = "Copy"
        enableVisibiltyOptions = false
        break
      case "copy":
        titlebar = "Copy Window"
        okButton = "Copy"
        break
      case "add-drawing":
        title = title || "Untitled Drawing"
        titlebar = "Add Drawing"
        okButton = "Add"
        break
      case "add-table":
        title = title || "Untitled Table"
        titlebar = "Add Table"
        okButton = "Add"
        break
      case "add-graph":
        title = title || "Untitled Graph"
        titlebar = "Add Graph"
        okButton = "Add"
        break
      case "add-snapshot":
        title = title || "Untitled Snapshot"
        titlebar = "Add Snapshot"
        okButton = "Add"
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
    if (!this.state.modalWindowOptions) {
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

  renderLearningLog() {
    const {portalTokens, portalUser, portalOffering} = this.props
    if (!this.state.showLearningLog || !portalTokens || !portalUser || !portalOffering) {
      return null
    }
    return <LearningLogComponent
              portalTokens={portalTokens}
              portalUser={portalUser}
              onClose={this.handleToggleLearningLogButton}
              portalOffering={portalOffering}
              toggleFavorite={this.handleToggleFavorite}
              copyIntoDocument={this.handleCopyIntoDocument}
            />
  }

  renderProgressMessage() {
    const {progressMessage} = this.state
    if (progressMessage === null) {
      return null
    }
    return (
      <div className="progress-message-container">
        <div className="progress-message">
          <div className="progress">{progressMessage}</div>
        </div>
      </div>
    )
  }

  renderPosterAnnotation(annotation:Annotation) {
    switch (annotation.type) {
      case "path":
        const [first, ...rest] = annotation.points || []
        if (first) {
          const d = `M${first.x} ${first.y} ${rest.map((p) => `L${p.x} ${p.y}`).join(" ")}`
          return <path key={annotation.id} d={d} stroke="#f00" strokeWidth="2" fill="none" />
        }
        break
    }
    return null
  }

  renderPosterAnnotations() {
    const {posterAnnotationsElement} = this
    const {posterAnnotations, currentPosterAnnotation, annotatingPoster} = this.state
    const pointerEvents = annotatingPoster ? "all" : "none"
    const [width, height] = posterAnnotationsElement ? [posterAnnotationsElement.clientWidth, posterAnnotationsElement.clientHeight] : ["100%", "100%"]
    const currentAnnotationElement = currentPosterAnnotation ? this.renderPosterAnnotation(currentPosterAnnotation) : null
    const annotationElements = Object.keys(posterAnnotations).map<JSX.Element|null>((key) => this.renderPosterAnnotation(posterAnnotations[key]))
    return (
      <div className="poster-annotations" ref={(el) => this.posterAnnotationsElement = el} style={{pointerEvents: pointerEvents}} onMouseDown={this.handlePosterAnnotationMouseDown}>
        <svg xmlnsXlink= "http://www.w3.org/1999/xlink" width={width} height={height}>
          {annotationElements}
          {currentAnnotationElement}
        </svg>
      </div>
    )
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
        {this.renderUploadImageDialog()}
        {this.renderLearningLog()}
        {this.renderModal()}
        {this.renderProgressMessage()}
        {this.renderPosterAnnotations()}
        {this.renderReadonlyBlocker()}
      </div>
    )
  }
}