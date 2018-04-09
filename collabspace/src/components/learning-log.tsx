import * as React from "react"
import * as firebase from "firebase"
import { PortalOffering, PortalUser, PortalTokens, PortalClassInfo, getClassInfo } from "../lib/auth"
import { getPortalPath } from "../lib/refs"
import { FirebaseOfferingMap, FirebasePublicationMap, FirebaseArtifact, FirebasePublication } from "../lib/document"
import { LiveTimeAgoComponent } from "./live-time-ago"
import * as queryString from "query-string"
import * as superagent from "superagent"
import escapeFirebaseKey from "../lib/escape-firebase-key"

const isDemo = require("../../functions/demo-info").demoInfo.isDemo

export interface UserMap {
  [key: string]: PortalUser
}

export interface ClassData {
  info: PortalClassInfo
  offeringsRef?: firebase.database.Reference
  publicationsRef?: firebase.database.Reference
  offerings?: FirebaseOfferingMap
  publications?: FirebasePublicationMap
}

export interface PortalClassResponse {
  uri: string
  name: string
  class_hash: string
}

export interface PortalClassesResponse {
  classes: PortalClassResponse[]
}

export interface LearningLogTableRow {
  classHash: string
  className: string
  creator: PortalUser
  group: number
  groupMembers: PortalUser[]
  publishedAt: number
  artifactName: string
  artifactId: string
  artifact: FirebaseArtifact
  documentName: string
  documentId: string
  ownerId?: string
  publication: FirebasePublication
}

export interface LearningLogComponentProps {
  portalUser: PortalUser
  portalTokens: PortalTokens
  portalOffering: PortalOffering
  onClose: () => void
}

export interface LearningLogComponentState {
  error: any|null
  loadingClasses: boolean
  classes: ClassData[]
  users: UserMap,
  tableRows: LearningLogTableRow[]
  selectedRow: LearningLogTableRow|null
}

export class LearningLogComponent extends React.Component<LearningLogComponentProps, LearningLogComponentState> {
  search: HTMLInputElement|null

  constructor (props:LearningLogComponentProps) {
    super(props);
    this.state = {
      error: null,
      loadingClasses: true,
      classes: [],
      users: {},
      tableRows: [],
      selectedRow: null
    }
  }

  componentWillMount() {
    superagent
      .get(this.getMyClasseUrl())
      .set("Authorization", `Bearer/JWT ${this.props.portalTokens.rawPortalJWT}`)
      .end((error, res) => {
        if (error) {
          this.setState({error})
          return
        }
        const response = res.body as PortalClassesResponse
        const portalClasses = response.classes || []

        // create super agent promise to get class info for all classes
        const classInfoRequests: Promise<PortalClassInfo>[] = []
        portalClasses.forEach((portalClass) => {
          classInfoRequests.push(getClassInfo(portalClass.uri, this.props.portalTokens.rawPortalJWT))
        })

        Promise.all(classInfoRequests)
          .then((responses) => {
            const {users, classes} = this.state

            const addToMap = (user:PortalUser) => {
              users[user.id] = user
              users[escapeFirebaseKey(user.id)] = user
            }

            responses.forEach((info) => {
              const classData:ClassData = {info}
              info.students.forEach(addToMap)
              info.teachers.forEach(addToMap)
              classes.push(classData)

              this.listenToClass(classData)
            })

            this.setState({classes, users, loadingClasses: false})
          })
          .catch((error) => {
            this.setState({error})
          })
      })
  }

  componentWillUnmount() {
    this.state.classes.forEach((classData) => {
      this.stopListeningToClass(classData)
    })
  }

  getMyClasseUrl() {
    // get the api endpoint to get the list of the user's classes by hacking the classInfoUrl which looks like either:
    // https://learn.concord.org/api/v1/classes/3794 for real portal session OR
    // https://us-central1-collabspace-920f6.cloudfunctions.net/demoGetFakeClassInfo?demo=09f0bb9b-eb91-4917-8e83-cc0bc04dfb6c for a demo class
    const {classInfoUrl} = this.props.portalOffering
    if (classInfoUrl.indexOf("demoGetFakeClassInfo") !== -1) {
      return `${classInfoUrl.split("demoGetFakeClassInfo")[0]}demoGetFakeMyClasses`
    }
    const urlParts = classInfoUrl.split("/")
    urlParts.pop()
    urlParts.push("mine")
    return urlParts.join("/")
  }

  listenToClass(classData:ClassData) {
    const {portalOffering} = this.props
    const classRef = firebase.database().ref(`${getPortalPath(portalOffering)}/classes/${classData.info.classHash}`)

    classData.offeringsRef = classRef.child("offerings")
    classData.publicationsRef = classRef.child("publications")

    classData.offeringsRef.on("value", (snapshot) => {
      classData.offerings = snapshot && snapshot.val()
      this.updateTable()
    })
    classData.publicationsRef.on("value", (snapshot) => {
      classData.publications = snapshot && snapshot.val()
      this.updateTable()
    })
  }

  stopListeningToClass(classData:ClassData) {
    if (classData.offeringsRef) {
      classData.offeringsRef.off()
    }
    if (classData.publicationsRef) {
      classData.publicationsRef.off()
    }
  }

  updateTable() {
    const {portalUser} = this.props
    const {classes, users} = this.state
    const tableRows:LearningLogTableRow[] = []
    const isTeacher = portalUser.type === "teacher"

    classes.forEach((classData) => {
      const {publications, offerings} = classData
      if (publications) {
        Object.keys(publications).forEach((publicationId) => {
          const publication = publications[publicationId]
          const offering = offerings && offerings[publication.offeringId]
          if (offering) {
            const groupMembers = Object.keys(publication.groupMembers).map((userId) => this.lookupUser(userId))

            Object.keys(publication.windows || {}).forEach((windowId) => {
              const window = publication.windows[windowId]

              // filter out private windows unless this is a teacher or the publisher
              if (isTeacher || !window.ownerId || (window.ownerId === portalUser.id)) {
                const artifactIds = Object.keys(window.artifacts || {})
                const multipleArtifacts = artifactIds.length > 1
                artifactIds.forEach((artifactId) => {
                  const artifact = window.artifacts[artifactId]

                  const tableRow:LearningLogTableRow = {
                    classHash: classData.info.classHash,
                    className: classData.info.name,
                    creator: this.lookupUser(publication.creator),
                    group: publication.group,
                    groupMembers,
                    publishedAt: publication.createdAt as number,
                    artifact,
                    artifactName: multipleArtifacts ? `${window.title}: ${artifact.title}` : window.title,
                    artifactId: artifactId,
                    documentName: offering.name,
                    documentId: publication.documentId,
                    ownerId: window.ownerId,
                    publication
                  }
                  tableRows.push(tableRow)
                })
              }
            })
          }
        })
      }
    })

    tableRows.sort((a, b) => b.publishedAt - a.publishedAt)

    this.setState({tableRows})
  }

  lookupUser(userId:string) {
    return this.state.users[userId] || this.state.users[escapeFirebaseKey(userId)]
  }

  getUserName(userId:string) {
    const user = this.lookupUser(userId)
    return user ? user.fullName : "Unknown User"
  }

  handleHideLearningLogButton = () => {
    this.props.onClose()
  }

  handleSearch = () => {
    this.forceUpdate()
  }

  handleSelectRow = (selectedRow:LearningLogTableRow|null) => {
    this.setState({selectedRow})
  }

  renderWorkspace() {
    const {error, loadingClasses, tableRows, selectedRow} = this.state
    if (error) {
      return <div className="centered"><div className="error">{error.toString()}</div></div>
    }
    if (loadingClasses) {
      return <div className="centered"><div className="progress">Loading classes...</div></div>
    }

    const searchRegEx = this.search ? new RegExp(this.search.value.trim(), "i") : null
    const filteredRows = tableRows.filter((tableRow) => {
      if (searchRegEx !== null) {
        return searchRegEx.test(tableRow.className) || searchRegEx.test(tableRow.artifactName) || searchRegEx.test(tableRow.documentName) || searchRegEx.test(tableRow.creator.fullName)
      }
      return true
    })

    return (
      <div className="learning-log-table">
        <table>
          <thead>
            <tr>
              <th>Class</th>
              <th>Activity</th>
              <th>Artifact</th>
              <th>Publisher</th>
              <th>Group</th>
              <th>Group Members</th>
              <th>Visibility</th>
              <th>Published</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((tableRow, index) => {
              const classNames = []
              if (index % 2 == 0) {
                classNames.push("even")
              }
              if (tableRow === selectedRow) {
                classNames.push("selected-row")
              }
              return (
                <tr key={tableRow.artifactId} onClick={() => this.handleSelectRow(tableRow)} className={classNames.join(" ")}>
                  <td>{tableRow.className}</td>
                  <td>{tableRow.documentName}</td>
                  <td>{tableRow.artifactName}</td>
                  <td><span className="initials" title={tableRow.creator.fullName}>{tableRow.creator.initials}</span></td>
                  <td>{tableRow.group}</td>
                  <td>{tableRow.groupMembers.map((groupMember) => <span title={groupMember.fullName}>{groupMember.initials}</span>)}</td>
                  <td>{tableRow.ownerId ? "Private" : "Public"}</td>
                  <td><LiveTimeAgoComponent timestamp={tableRow.publishedAt} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  renderSelectedRow() {
    const {selectedRow} = this.state
    if (!selectedRow) {
      return null
    }

    return (
      <div className="learning-log-selected-row">
        <div className="learning-log-selected-row-background" />
        <div className="learning-log-selected-row-modal-container">
          <div className="learning-log-selected-row-modal">
            <div className="learning-log-selected-row-modal-title">
              {selectedRow.artifactName}
            </div>
            <div className="learning-log-selected-row-modal-preview">
              <img src={selectedRow.artifact.url} />
            </div>
            <div className="learning-log-selected-row-modal-buttons">
              <button onClick={() => alert("TODO: implement button action")}>Copy Into Current Document</button>
              <button onClick={() => alert("TODO: implement button action")}>View In Original Document</button>
              <button onClick={() => this.handleSelectRow(null)}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  render() {
    return (
      <div className="learning-log">
        <div className="toolbar">
          <div className="buttons">
            <div className="left-buttons">
              <div className="learning-log-title">Artifacts List</div>
            </div>
            <div className="right-buttons">
              <input type="text" placeholder="Search ..." ref={(search) => this.search = search} onChange={this.handleSearch} />
              <button type="button" onClick={this.handleHideLearningLogButton}><i className="icon icon-profile" /> Close Artifacts List</button>
            </div>
          </div>
        </div>
        <div className="learning-log-workspace">
          {this.renderWorkspace()}
          {this.renderSelectedRow()}
        </div>
      </div>
    )
  }
}

