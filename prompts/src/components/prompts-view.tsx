import * as React from "react"
import * as queryString from "query-string"
import * as firebase from "firebase"
import { FirebaseConfig } from "../../../collabspace/src/lib/firebase-config"
import { v1 as uuid } from "uuid"
import { LogManager } from "../../../shared/log-manager"
import { WorkspaceClient, WorkspaceClientInitRequest, WorkspaceClientPublishResponse, WorkspaceClientThumbnailWidth } from "../../../shared/workspace-client"

interface ActivityListItem {
  name: string
  id: string
}

interface ActivityListMap {
  [key: string]: ActivityListItem
}

// NOTE: this is only a subset of the fields available in the LARA exported JSON
interface ActivityEmbeddable {
  name: string
  hint: string
  prompt: string
  type: string
  content: string
}
interface ActivityPage {
  name: string
  text: string
  embeddables: ActivityEmbeddable[]
}
interface Activity {
  name: string
  pages: ActivityPage[]
}

export interface EmbeddableProps {
  embeddable: ActivityEmbeddable
  ifNotEmpty: (o:any, key:string, fn:Function) => void
  logManager: LogManager|null
}
export interface EmbeddableState {
  showHint: boolean
}

export class EmbeddableView extends React.Component<EmbeddableProps, EmbeddableState> {
  constructor(props:EmbeddableProps){
    super(props)
    this.toggleHint = this.toggleHint.bind(this)
    this.state = {
      showHint: false
    }
  }

  toggleHint(hint: string) {
    const showHint = !this.state.showHint
    if (this.props.logManager) {
      this.props.logManager.logEvent(showHint ? "Opened LARA hint" : "Closed LARA hint", null, {hint})
    }
    this.setState({showHint})
  }

  renderHintIcon(hint: string) {
    return <span className="hint-toggle" onClick={() => this.toggleHint(hint)}>?</span>
  }

  renderHint(hint: string|null) {
    if (!hint) {
      return null
    }
    return (
      <div className="hint">
        {this.renderHintIcon(hint)}
        {this.state.showHint ? <span dangerouslySetInnerHTML={{__html: hint}} /> : null}
      </div>
    )
  }

  renderEmbeddable(embeddable:ActivityEmbeddable) {
    return (
      <div className="activity-embeddable">
        {this.props.ifNotEmpty(embeddable, "name", () => <h2>{embeddable.name}</h2>)}
        {this.props.ifNotEmpty(embeddable, "prompt", () => <p dangerouslySetInnerHTML={{__html: embeddable.prompt}}></p>)}
        {this.renderHint(embeddable.hint)}
      </div>
    )
  }

  render() {
    const {embeddable} = this.props
    const {type, name, content} = embeddable
    if (type && name && (type === "Embeddable::Xhtml") && (name.trim().toLowerCase() === "hint")) {
      return this.renderHint(content);
    }
    return this.renderEmbeddable(embeddable);
  }
}

export interface ActivityListItemProps {
  item: ActivityListItem
  handleUpdate: (item: ActivityListItem) => void
  handleDelete: (item: ActivityListItem) => void
}
export interface ActivityListItemState {}

export class ActivityListItemView extends React.Component<ActivityListItemProps, ActivityListItemState> {
  constructor(props:ActivityListItemProps){
    super(props)
  }

  render() {
    const { item } = this.props
    const href = `#activity=${item.id}`
    return (
      <tr>
        <td><a href={href}>{item.name}</a></td>
        <td className="buttons">
          <button onClick={() => this.props.handleUpdate(this.props.item)}>Update</button>
          <button onClick={() => this.props.handleDelete(this.props.item)}>Delete</button>
        </td>
      </tr>
    )
  }
}

export interface PromptsViewProps {}

export interface PromptsViewState {
  authenticated: boolean,
  updateActivity: ActivityListItem|null
  activityId: string|null
  activity: Activity|null
  activitiesList: ActivityListMap
  importError: string|null
  activityError: string|null
  currentPage: ActivityPage|null
}

export class PromptsView extends React.Component<PromptsViewProps, PromptsViewState> {
  activityListRef: firebase.database.Reference
  workspaceClient: WorkspaceClient
  logManager: LogManager|null

  constructor(props:PromptsViewProps){
    super(props)

    this.parseHash = this.parseHash.bind(this)
    this.handleDrop = this.handleDrop.bind(this)
    this.handleDragOver = this.handleDragOver.bind(this)
    this.handleUpdate = this.handleUpdate.bind(this)
    this.handleDelete = this.handleDelete.bind(this)
    this.renderPage = this.renderPage.bind(this)

    this.state = {
      authenticated: false,
      updateActivity: null,
      activityId: null,
      activity: null,
      activitiesList: {},
      importError: null,
      activityError: null,
      currentPage: null
    }
  }

  refs: {
    url: HTMLInputElement
  }

  componentWillMount() {
    firebase.initializeApp(FirebaseConfig)
    firebase.auth().signInAnonymously()
      .then(() => {
        this.setState({authenticated: true})

        this.workspaceClient = new WorkspaceClient({
          init: (req) => {
            if ((req.type === "collabspace") && req.tokens) {
              this.logManager = new LogManager({tokens: req.tokens, activity: "CollabSpace"})
            }
            return {}
          }
        })

        this.activityListRef = this.getRef("activityList")
        this.activityListRef.on("value", (snapshot) => {
          let activitiesList:ActivityListMap|null = snapshot ? snapshot.val() : null
          if (activitiesList === null) {
            activitiesList = {}
          }
          this.setState({activitiesList})
        })

        this.parseHash()
        window.addEventListener("hashchange", this.parseHash)
      })
      .catch((err) => {
        alert(err)
      })
  }

  getRefKey(suffix:string) {
    return `prompts/${suffix}`
  }

  getRef(suffix:string):firebase.database.Reference {
    return firebase.database().ref(this.getRefKey(suffix))
  }

  getActivityKey(activityId:string) {
    return this.getRefKey(`activity/${activityId}`)
  }

  getActivityRef(activityId:string) {
    return firebase.database().ref(this.getActivityKey(activityId))
  }

  parseHash() {
    const params = queryString.parse(window.location.hash)
    this.setState({activityId: params.activity || null, activity: null, activityError: null})
    if (params.activity) {
      this.getActivityRef(params.activity).once("value", (snapshot) => {
        const activity:Activity|null = snapshot.val()
        if (activity === null) {
          this.setState({activityError: `Unknown activity: ${params.activity}`})
        }
        else {
          this.setState({activity, currentPage: activity.pages[0]})
        }
      })
    }
  }

  renderAccordian(activity:Activity) {
    return (
      <div className="accordian">
        {activity.pages.map((page, index) => {
          const className = `accordian-item ${page === this.state.currentPage ? "accordian-item-selected" : ""}`
          return <div key={index} className={className} onClick={() => this.setState({currentPage: page})}>{page.name}</div>
        })}
      </div>
    )
  }

  renderPage(page:ActivityPage, index:number) {
    const style = {display: page === this.state.currentPage ? "block" : "none"}
    //{this.ifNotEmpty(page, "name", () => <h2>{page.name}</h2>)}
    return (
      <div className="page" key={index} style={style}>
        {this.ifNotEmpty(page, "text", () => <p dangerouslySetInnerHTML={{__html: page.text}}></p>)}
        {this.ifNotEmpty(page, "embeddables", () => page.embeddables.map((embeddable, index) => <EmbeddableView key={index} embeddable={embeddable} ifNotEmpty={this.ifNotEmpty} logManager={this.logManager} />))}
      </div>
    )
  }

  renderActivity() {
    const {activity, currentPage} = this.state
    if (!activity || !currentPage) {
      return <div className="loading">Loading...</div>
    }

    return (
      <div className="activity">
        {this.renderAccordian(activity)}
        {activity.pages.map(this.renderPage)}
      </div>
    )
  }

  ifNotEmpty(o:any, key:string, fn:Function) {
    if (o && o.hasOwnProperty(key) && o[key]) {
      return fn()
    }
    return null
  }

  handleUpdate(item:ActivityListItem) {
    this.setState({updateActivity: item})
  }

  updateItem(currentItem:ActivityListItem, newItem:ActivityListItem|null, newActivity:Activity|null) {
    const firebaseId = Object.keys(this.state.activitiesList).find((key) => this.state.activitiesList[key].id === currentItem.id)
    if (firebaseId) {
      const updates:any = {}
      updates[firebaseId] = newItem
      this.activityListRef.update(updates)
      this.getActivityRef(currentItem.id).set(newActivity)
    }
  }

  handleDelete(item:ActivityListItem) {
    if (confirm(`Are you sure you want to delete ${item.name}?`)) {
      this.updateItem(item, null, null)
    }
  }

  renderActivityList() {
    const keys = Object.keys(this.state.activitiesList)
    if (keys.length === 0) {
      return null
    }

    return (
      <div className="activity-list">
        <table>
          <tbody>
            {keys.map((key) => {
              const item = this.state.activitiesList[key]
              return <ActivityListItemView key={item.id} item={item} handleDelete={this.handleDelete} handleUpdate={this.handleUpdate} />
            })}
          </tbody>
        </table>
      </div>
    )
  }

  renderImportError() {
    if (this.state.importError === null) {
      return null
    }
    return <div className="import-error">{this.state.importError}</div>
  }

  handleDragOver(e:React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
  }

  handleDrop(e:React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    if (e.dataTransfer.files.length > 0) {
      this.setState({importError: null})
      const reader = new FileReader()
      reader.addEventListener("load", (file) => {
        try {
          const activity:Activity = JSON.parse(reader.result)
          if (activity && activity.hasOwnProperty("name")) {
            if (this.state.updateActivity) {
              this.updateItem(this.state.updateActivity, {name: activity.name, id: this.state.updateActivity.id}, activity)
              this.setState({updateActivity: null})
            }
            else {
              const id = uuid()
              this.getActivityRef(id).set(activity)
              const item: ActivityListItem = {name: activity.name, id}
              const itemRef = this.activityListRef.push(item)
            }
          }
          else {
            this.setState({importError: "This does not look like an exported activity (it is missing the name)"})
          }
        }
        catch (e) {
          this.setState({importError: e.toString()})
        }
      })
      reader.readAsText(e.dataTransfer.files[0])
    }
  }

  renderImport() {
    const message = this.state.updateActivity ? `Drop the updated LARA activity file to update ${this.state.updateActivity.name}...` : "Drop an exported LARA activity here to import it..."
    return (
      <div className="import-dropzone" onDrop={this.handleDrop} onDragOver={this.handleDragOver}>
        { message }
        { this.renderImportError() }
      </div>
    )
  }

  renderActivityCrud() {
    return (
      <div className="activity-crud">
        <h1>Imported Activities</h1>
        { this.renderImport() }
        { this.state.updateActivity === null ? this.renderActivityList() : null }
      </div>
    )
  }

  render() {
    if (!this.state.authenticated) {
      return <div className="loading">Authenticating...</div>
    }
    if (this.state.activityId !== null) {
      return this.renderActivity()
    }
    return this.renderActivityCrud()
  }
}