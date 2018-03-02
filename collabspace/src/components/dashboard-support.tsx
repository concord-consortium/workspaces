import * as React from "react"
import * as firebase from "firebase"
import { PortalOffering, PortalUser, AuthQueryParams, PortalTokens } from "../lib/auth"
import { getSupportsRef, getSupportsSeenRef } from "../lib/refs"
import { FirebaseOfferingMap, FirebasePublicationMap, FirebasePublication } from "../lib/document"
import { UserLookup } from "../lib/user-lookup"
import * as queryString from "query-string"

const timeago = require("timeago.js")
const timeagoInstance = timeago()

export interface DashboardSuportComponentProps {
  firebaseUser: firebase.User
  portalUser: PortalUser
  portalOffering: PortalOffering
  portalTokens: PortalTokens
}

export interface SupportWithId extends Support {
  id: string
}

export interface DashboardSuportComponentState {
  supports: SupportWithId[]
  supportsSeen: SupportSeenMap
  assignedTo: string
  assignedToLabel: string
}

export interface Support {
  offeringId: number
  text: string
  assignedTo: string
  createdAt: number|object
}

export interface SupportSeenMap {
  [key: string]: string
}

export interface FirebaseSupportMap {
  [key: string]: Support|null
}

export interface FirebaseSupportSeenUsersSupportMap {
  [key: string]: number|object
}
export interface FirebaseSupportUserSeen {
  supports: FirebaseSupportSeenUsersSupportMap
}
export interface FirebaseSupportSeenUsersMap {
  [key: string]: FirebaseSupportUserSeen
}
export interface FirebaseSupportSeen {
  users: FirebaseSupportSeenUsersMap
}
export interface FirebaseSupportSeenMap {
  [key: string]: FirebaseSupportSeen
}

export class DashboardSuportComponent extends React.Component<DashboardSuportComponentProps, DashboardSuportComponentState> {
  userLookup: UserLookup
  supportsRef: firebase.database.Reference
  supportsSeenRef: firebase.database.Reference

  text: HTMLTextAreaElement|null
  assignedToGroup: HTMLSelectElement|null
  assignedToUser: HTMLSelectElement|null

  constructor (props:DashboardSuportComponentProps) {
    super(props);
    this.state = {
      supports: [],
      supportsSeen: {},
      assignedTo: "class",
      assignedToLabel: "Class"
    }

    this.userLookup = new UserLookup(this.props.portalOffering.classInfo)
  }

  componentWillMount() {
    this.supportsRef = getSupportsRef(this.props.portalOffering)
    this.supportsRef.on("value", this.handleSupportsRef)

    this.supportsSeenRef = getSupportsSeenRef(this.props.portalOffering)
    this.supportsSeenRef.on("value", this.handleSupportsSeenRef)
  }

  componentWillUnmount() {
    this.supportsRef.off("value", this.handleSupportsRef)
    this.supportsSeenRef.off("value", this.handleSupportsSeenRef)
  }

  handleSupportsRef = (snapshot:firebase.database.DataSnapshot) => {
    const {portalOffering} = this.props
    const supports:SupportWithId[] = []
    const allSupports:FirebaseSupportMap|null = snapshot.val()
    if (allSupports) {
      Object.keys(allSupports).forEach((supportId) => {
        const supportWithId:SupportWithId = allSupports[supportId] as SupportWithId
        if (supportWithId.offeringId == portalOffering.id) {
          supportWithId.id = supportId
          supports.push(supportWithId)
        }
      })
    }
    supports.sort((a, b) => {
      return (b.createdAt as number) - (a.createdAt as number)
    })
    this.setState({supports})
  }

  handleSupportsSeenRef = (snapshot:firebase.database.DataSnapshot) => {
    const supportUsers:any = {}
    const firebaseSupportsSeen:FirebaseSupportSeen = snapshot.val() || {}
    if (firebaseSupportsSeen.users) {
      Object.keys(firebaseSupportsSeen.users).forEach((userId) => {
        const user = this.userLookup.lookup(userId)
        const username = user ? user.fullName : "(unknown user)"
        Object.keys(firebaseSupportsSeen.users[userId]).forEach((supportId) => {
          if (!supportUsers[supportId]) {
            supportUsers[supportId] = []
          }
          supportUsers[supportId].push(username)
        })
      })
    }

    const supportsSeen:SupportSeenMap = {}
    Object.keys(supportUsers).forEach((supportId) => supportsSeen[supportId] = supportUsers[supportId].join(", "))
    this.setState({supportsSeen})
  }

  getOptionNames(options:HTMLOptionsCollection) {
    return [].filter.call(options, (option:HTMLOptionElement) => option.selected).map((option:HTMLOptionElement) => option.innerHTML).join(", ")
  }

  getOptionValues(options:HTMLOptionsCollection) {
    return [].filter.call(options, (option:HTMLOptionElement) => option.selected).map((option:HTMLOptionElement) => option.value).join(",")
  }

  handleSubmitSupport = (e:React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    // validate input
    if (!this.text || !this.state.assignedTo || !this.assignedToGroup || !this.assignedToUser) {
      return;
    }

    let assignedTo
    switch (this.state.assignedTo) {
      case "group":
        assignedTo = this.getOptionValues(this.assignedToGroup.options)
        break
      case "user":
        assignedTo = this.getOptionValues(this.assignedToUser.options)
        break
      case "class":
      default:
        assignedTo = "class"
        break
    }

    const text = this.text.value.trim()
    if ((text.length === 0) || (assignedTo.length === 0)) {
      return
    }

    const support:Support = {
      offeringId: this.props.portalOffering.id,
      text,
      assignedTo,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    }

    this.supportsRef.push(support)
    this.text.value = ""
  }

  handleCopySupport = (support:SupportWithId) => {
    if (this.text) {
      this.text.value = support.text;
    }
  }

  handleDeleteSupport = (support:SupportWithId) => {
    if (confirm("Are you sure you want to delete this support?")) {
      this.supportsRef.child(support.id).set(null)
    }
  }

  setAssignedToLabel(assignedTo:string) {
    let assignedToLabel
    switch (assignedTo) {
      case "group":
        assignedToLabel = this.assignedToGroup ? this.getOptionNames(this.assignedToGroup.options) : "N/A"
        break
      case "user":
        assignedToLabel = this.assignedToUser ? this.getOptionNames(this.assignedToUser.options) : "N/A"
        break
      case "class":
      default:
        assignedToLabel = "Class"
    }
    this.setState({assignedToLabel})
  }

  handleAssignedTo = (e:React.ChangeEvent<HTMLInputElement>) => {
    const assignedTo = e.target.value
    this.setState({assignedTo})
    this.setAssignedToLabel(assignedTo)
  }

  handleSetAssignTo = (assignedTo: string) => {
    this.setState({assignedTo})
    this.setAssignedToLabel(assignedTo)
  }

  renderProgress(progress:string) {
    return <div className="progress">{progress}</div>
  }

  renderForm() {
    const {assignedTo, assignedToLabel} = this.state,
          groupOptions:JSX.Element[] = [],
          userOptions:JSX.Element[] = [];

    for (let i=1; i <= 99; i++) {
      groupOptions.push(<option value={`group|${i}`} key={`group:${i}`}>Group {i}</option>)
    }
    this.props.portalOffering.classInfo.students.forEach((student) => {
      userOptions.push(<option value={`user|${student.id}`} key={`user:${student.id}`}>{student.fullName}</option>)
    })

    return (
      <div>
        <h2>New Support</h2>
        <form onSubmit={this.handleSubmitSupport}>
          <textarea name="text" placeholder="Type your support here..."  ref={(text) => this.text = text }/>
          <label htmlFor="assign_to">Assign To: <span className="assigned-to-label">{assignedToLabel}</span></label>
          <div className="support-assign-to">
            <div className="support-assign-to-block">
              <input type="radio" name="assignTo" value="class" checked={assignedTo === "class"} onChange={this.handleAssignedTo}/> Class
            </div>
            <div className="support-assign-to-block">
              <input type="radio" name="assignTo" value="group" checked={assignedTo === "group"} onChange={this.handleAssignedTo}/> Group
              <select name="assignToGroup" multiple ref={(assignToGroup) => this.assignedToGroup = assignToGroup } onChange={() => this.handleSetAssignTo("group")}>{groupOptions}</select>
            </div>
            <div className="support-assign-to-block">
              <input type="radio" name="assignTo" value="user" checked={assignedTo === "user"} onChange={this.handleAssignedTo} /> User
              <select name="assignToUser" multiple ref={(assignToUser) => this.assignedToUser = assignToUser } onChange={() => this.handleSetAssignTo("user")}>{userOptions}</select>
            </div>
          </div>
          <input type="submit" value="Give Support" className="button" />
        </form>
      </div>
    )
  }

  renderAssignedTo(assignedTo:string) {
    return assignedTo.split(",").map((item) => {
      if (item === "class") {
        return "Class"
      }
      const [type, id, ...rest] = item.split("|")
      if (type === "group") {
        return `Group ${id}`
      }
      const user = this.userLookup.lookup(id)
      return user ? user.fullName : "(unknown user)"
    }).join(", ")
  }

  renderSupport = (support:SupportWithId, index:number) => {
    return (
      <div className="support" key={index}>
        <div className="support-right">
          <div>{timeagoInstance.format(support.createdAt)}</div>
          <div>
            <button onClick={() => this.handleCopySupport(support)}>Copy Support Text</button>
            <button onClick={() => this.handleDeleteSupport(support)}>Delete Support</button>
          </div>
        </div>

        <div className="support-assigned-to">Assigned to: {this.renderAssignedTo(support.assignedTo)}</div>
        <div className="support-text">{support.text}</div>
        <div className="support-seen-by">Seen by: {this.state.supportsSeen[support.id] || "None"}</div>
      </div>
    )
  }

  renderPreviousSupport() {
    const {supports} = this.state
    if (supports.length === 0) {
      return null
    }

    return (
      <div>
        <h2>Previous Support</h2>
        {supports.map(this.renderSupport)}
      </div>
    )
  }

  render() {
    return (
      <div className="dashboard-support">
        {this.renderForm()}
        {this.renderPreviousSupport()}
      </div>
    )
  }
}

