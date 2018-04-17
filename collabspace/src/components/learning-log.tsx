import * as React from "react"
import * as firebase from "firebase"
import { PortalOffering, PortalUser, PortalTokens, PortalClassInfo, getClassInfo } from "../lib/auth"
import { getPortalPath } from "../lib/refs"
import { FirebaseOfferingMap, FirebasePublicationMap, FirebaseArtifact, FirebasePublication } from "../lib/document"
import { LiveTimeAgoComponent } from "./live-time-ago"
import { FirebaseFavorites } from "./sidebar"
import * as queryString from "query-string"
import * as superagent from "superagent"
import escapeFirebaseKey from "../lib/escape-firebase-key"
import { ToggleFavoritesOptions } from "./workspace";

const isDemo = require("../../functions/demo-info").demoInfo.isDemo

export type SortTableBy =
  "Class" |
  "Activity" |
  "Artifact" |
  "Published By" |
  "Group" |
  "Group Members" |
  "Visibility" |
  "Published"
export type SortTableDir = "" | "asc" | "desc"
export const SortDirOrder:SortTableDir[] = ["desc", "asc", ""]

export interface LearningLogHeaderComponentProps {
  header: SortTableBy
  sortBy: SortTableBy
  sortDir: SortTableDir
  handleToggle: (sortBy: SortTableBy) => void
}

export interface LearningLogHeaderComponentState {
}

export class LearningLogHeaderComponent extends React.Component<LearningLogHeaderComponentProps, LearningLogHeaderComponentState> {

  constructor (props:LearningLogHeaderComponentProps) {
    super(props);
    this.state = {
    }
  }

  handleToggle = () => {
    this.props.handleToggle(this.props.header)
  }

  renderArrow() {
    const {header, sortBy, sortDir} = this.props
    if (header === sortBy) {
      switch (sortDir) {
        case "asc": return <span>▲</span>
        case "desc": return <span>▼</span>
      }
    }
    return <span> </span>
  }

  render() {
    return <th onClick={this.handleToggle}>{this.props.header}{this.renderArrow()}</th>
  }
}


export interface UserMap {
  [key: string]: PortalUser
}

export interface ClassData {
  info: PortalClassInfo
  offeringsRef?: firebase.database.Reference
  publicationsRef?: firebase.database.Reference
  favoritesRef?: firebase.database.Reference
  offerings?: FirebaseOfferingMap
  publications?: FirebasePublicationMap
  favorites?: FirebaseFavorites
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
  sortCreator: string
  group: number
  groupMembers: PortalUser[]
  sortGroupMembers: string
  publishedAt: number
  artifactName: string
  artifactId: string
  artifact: FirebaseArtifact
  offeringId: number,
  offeringName: string,
  ownerId?: string
  sortVisibility: number
  publication: FirebasePublication
  publicationId: string
  windowId: string
  favorited: boolean
}

export interface LearningLogComponentProps {
  portalUser: PortalUser
  portalTokens: PortalTokens
  portalOffering: PortalOffering
  onClose: () => void
  toggleFavorite: (options: ToggleFavoritesOptions) => void
}

export interface LearningLogComponentState {
  error: any|null
  loadingClasses: boolean
  classes: ClassData[]
  users: UserMap,
  tableRows: LearningLogTableRow[]
  selectedRow: LearningLogTableRow|null
  sortBy: SortTableBy
  sortDir: SortTableDir
  filterFavorites: string
  filterClass: string
  filterActivity: string|number
  filterArtifact: string
  filterPublishedBy: string
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
      selectedRow: null,
      sortBy: "Published",
      sortDir: "desc",
      filterFavorites: "all",
      filterClass: "all",
      filterActivity: "all",
      filterArtifact: "all",
      filterPublishedBy: "all"
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
    classData.favoritesRef = classRef.child("favorites")

    classData.offeringsRef.on("value", (snapshot) => {
      classData.offerings = snapshot && snapshot.val()
      this.updateTable()
    })
    classData.publicationsRef.on("value", (snapshot) => {
      classData.publications = snapshot && snapshot.val()
      this.updateTable()
    })
    classData.favoritesRef.on("value", (snapshot) => {
      classData.favorites = snapshot && snapshot.val()
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
    if (classData.favoritesRef) {
      classData.favoritesRef.off()
    }
  }

  updateTable() {
    const {portalUser} = this.props
    const {classes, users} = this.state
    const tableRows:LearningLogTableRow[] = []
    const isTeacher = portalUser.type === "teacher"

    classes.forEach((classData) => {
      const {publications, offerings, favorites} = classData
      if (publications) {
        Object.keys(publications).forEach((publicationId) => {
          const publication = publications[publicationId]
          const offering = offerings && offerings[publication.offeringId]
          if (offering) {
            const groupMembers = Object.keys(publication.groupMembers).map((userId) => this.lookupUser(userId))

            Object.keys(publication.windows || {}).forEach((windowId) => {
              const window = publication.windows[windowId]
              const userFavorites = favorites ? favorites.users[escapeFirebaseKey(portalUser.id)] : null
              const favorited = !!(userFavorites &&
                                   userFavorites.publications &&
                                   userFavorites.publications[publicationId] &&
                                   userFavorites.publications[publicationId].windows[windowId])

              // filter out private windows unless this is a teacher or the publisher
              if (isTeacher || !window.ownerId || (window.ownerId === portalUser.id)) {
                const artifactIds = Object.keys(window.artifacts || {})
                const multipleArtifacts = artifactIds.length > 1
                artifactIds.forEach((artifactId) => {
                  const artifact = window.artifacts[artifactId]
                  const creator = this.lookupUser(publication.creator)

                  const tableRow:LearningLogTableRow = {
                    classHash: classData.info.classHash,
                    className: classData.info.name,
                    creator: this.lookupUser(publication.creator),
                    sortCreator: creator.fullName.toLowerCase(),
                    group: publication.group,
                    groupMembers,
                    sortGroupMembers: groupMembers.map((user) => user.initials).join(" "),
                    publishedAt: publication.createdAt as number,
                    artifact,
                    artifactName: multipleArtifacts ? `${window.title}: ${artifact.title}` : window.title,
                    artifactId: artifactId,
                    offeringId: publication.offeringId,
                    offeringName: offering.name,
                    ownerId: window.ownerId,
                    sortVisibility: window.ownerId ? 1 : 0,
                    publication,
                    publicationId,
                    windowId,
                    favorited
                  }
                  tableRows.push(tableRow)
                })
              }
            })
          }
        })
      }
    })

    this.handleSortTable(tableRows)
  }

  handleSortTable = (tableRows?: LearningLogTableRow[]) => {
    const {sortBy, sortDir} = this.state

    tableRows = tableRows || this.state.tableRows

    tableRows.sort((a, b) => {
      let sortResult = 0
      switch (sortBy) {
        case "Class":
          sortResult = b.className.localeCompare(a.className)
          break
        case "Activity":
          sortResult = b.offeringName.localeCompare(a.offeringName)
          break
        case "Artifact":
          sortResult = b.artifactName.localeCompare(a.artifactName)
          break
        case "Published By":
          sortResult = b.sortCreator.localeCompare(a.sortCreator)
          break
        case "Group":
          sortResult = b.group - a.group
          break
        case "Group Members":
          sortResult = b.sortGroupMembers.localeCompare(a.sortGroupMembers)
          break
        case "Visibility":
          sortResult = b.sortVisibility - a.sortVisibility
          break
        case "Published":
          sortResult = b.publishedAt - a.publishedAt
          break
      }
      if (sortResult === 0) {
        sortResult = b.publishedAt - a.publishedAt
      }
      return sortDir === "asc" ? -sortResult : sortResult
    })

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

  handleToggleSort = (newSortBy: SortTableBy) => {
    const {sortBy, sortDir} = this.state
    const newSortDir = SortDirOrder[(SortDirOrder.indexOf(sortDir) + 1) % SortDirOrder.length]
    if (sortBy === newSortBy) {
      if (newSortDir === "") {
        this.setState({sortBy: "Published", sortDir: "desc"}, this.handleSortTable)
      }
      else {
        this.setState({sortDir: newSortDir}, this.handleSortTable)
      }
    }
    else {
      this.setState({sortBy: newSortBy, sortDir: "desc"}, this.handleSortTable)
    }
  }

  handleFilterFavorites = (e:React.ChangeEvent<HTMLSelectElement>) => {
    this.setState({filterFavorites: e.target.value})
  }

  handleFilterClasses = (e:React.ChangeEvent<HTMLSelectElement>) => {
    this.setState({filterClass: e.target.value})
  }

  handleFilterActivities = (e:React.ChangeEvent<HTMLSelectElement>) => {
    this.setState({filterActivity: e.target.value})
  }

  handleFilterArtifacts = (e:React.ChangeEvent<HTMLSelectElement>) => {
    this.setState({filterArtifact: e.target.value})
  }

  handleFilterPublisher = (e:React.ChangeEvent<HTMLSelectElement>) => {
    this.setState({filterPublishedBy: e.target.value})
  }

  handleToggleFavorite = (e: React.MouseEvent<HTMLElement>, tableRow: LearningLogTableRow) => {
    e.preventDefault()
    e.stopPropagation()
    const {publicationId, windowId, classHash} = tableRow
    this.props.toggleFavorite({
      type: "class",
      classHash,
      publicationId,
      windowId
    })
  }

  getUniqueOptions(callback: (tableRow:LearningLogTableRow, list:any[]) => undefined|{value: string|number, name: string}) {
    const {tableRows} = this.state
    const list:any[] = []
    const options:JSX.Element[] = []
    this.state.tableRows.forEach((tableRow) => {
      const item = callback(tableRow, list)
      if (item) {
        list.push(item.value)
        options.push(<option key={item.value} value={item.value}>{item.name}</option>)
      }
    })
    return options
  }

  renderFilters() {
    const {classes, users, loadingClasses} = this.state
    const {portalUser} = this.props

    if (loadingClasses) {
      return null
    }

    const activityOptions = this.getUniqueOptions((row, list) => {
      if (list.indexOf(row.offeringId) === -1) {
        return {value: row.offeringId, name: row.offeringName}
      }
    })
    const artifactOptions = this.getUniqueOptions((row, list) => {
      if (list.indexOf(row.artifactName) === -1) {
        return {value: row.artifactName, name: row.artifactName}
      }
    })
    const publisherOptions = this.getUniqueOptions((row, list) => {
      if (list.indexOf(row.creator.id) === -1) {
        return {value: row.creator.id, name: row.creator.fullName}
      }
    })
    publisherOptions.unshift(<option key="me" value={portalUser.id}>Me ({portalUser.fullName})</option>)

    return (
      <div className="learning-log-filters">
        <select onChange={this.handleFilterFavorites}>
          <option value="all">All Rows</option>
          <option value="favorites">Favorited Rows</option>
        </select>
        <select onChange={this.handleFilterClasses}>
          <option value="all">All Classes</option>
          {classes.map((clazz) => <option key={clazz.info.classHash} value={clazz.info.classHash}>{clazz.info.name}</option>)}
        </select>
        <select onChange={this.handleFilterActivities}>
          <option value="all">All Activities</option>
          {activityOptions}
        </select>
        <select onChange={this.handleFilterArtifacts}>
          <option value="all">All Artifacts</option>
          {artifactOptions}
        </select>
        <select onChange={this.handleFilterPublisher}>
          <option value="all">All Publishers</option>
          {publisherOptions}
        </select>
        <input type="text" placeholder="Search ..." ref={(search) => this.search = search} onChange={this.handleSearch} />
      </div>
    )
  }

  renderFavoriteStar(tableRow: LearningLogTableRow) {
    const className = tableRow.favorited ? "icon icon-star-full favorite-star" : "icon icon-star-empty"
    return <i className={className} onClick={(e) => this.handleToggleFavorite(e, tableRow)} />
  }

  renderWorkspace() {
    const {error, loadingClasses, tableRows, selectedRow, sortBy, sortDir, filterFavorites, filterClass, filterActivity, filterArtifact, filterPublishedBy} = this.state
    if (error) {
      return <div className="centered"><div className="error">{error.toString()}</div></div>
    }
    if (loadingClasses) {
      return <div className="centered"><div className="progress">Loading classes...</div></div>
    }

    const searchRegEx = this.search ? new RegExp(this.search.value.trim(), "i") : null
    const filteredRows = tableRows.filter((tableRow) => {
      const favoritesMatch = (filterFavorites === "all") || tableRow.favorited
      const classMatch = (filterClass === "all") || (tableRow.classHash == filterClass)
      const activityMatch = (filterActivity === "all") || (tableRow.offeringId == filterActivity)
      const artifactMatch = (filterArtifact === "all") || (tableRow.artifactName == filterArtifact)
      const publishedByMatch = (filterPublishedBy === "all") || (tableRow.creator.id == filterPublishedBy)
      const searchMatch = (searchRegEx === null) || searchRegEx.test(tableRow.className) || searchRegEx.test(tableRow.artifactName) || searchRegEx.test(tableRow.offeringName) || searchRegEx.test(tableRow.creator.fullName)
      return favoritesMatch && classMatch && activityMatch && artifactMatch && publishedByMatch && searchMatch
    })

    return (
      <div className="learning-log-table">
        <table>
          <thead>
            <tr>
              <th />
              <LearningLogHeaderComponent header="Class" sortBy={sortBy} sortDir={sortDir} handleToggle={this.handleToggleSort} />
              <LearningLogHeaderComponent header="Activity" sortBy={sortBy} sortDir={sortDir} handleToggle={this.handleToggleSort} />
              <LearningLogHeaderComponent header="Artifact" sortBy={sortBy} sortDir={sortDir} handleToggle={this.handleToggleSort} />
              <LearningLogHeaderComponent header="Published By" sortBy={sortBy} sortDir={sortDir} handleToggle={this.handleToggleSort} />
              <LearningLogHeaderComponent header="Group" sortBy={sortBy} sortDir={sortDir} handleToggle={this.handleToggleSort} />
              <LearningLogHeaderComponent header="Group Members" sortBy={sortBy} sortDir={sortDir} handleToggle={this.handleToggleSort} />
              <LearningLogHeaderComponent header="Visibility" sortBy={sortBy} sortDir={sortDir} handleToggle={this.handleToggleSort} />
              <LearningLogHeaderComponent header="Published" sortBy={sortBy} sortDir={sortDir} handleToggle={this.handleToggleSort} />
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
                  <td>{this.renderFavoriteStar(tableRow)}</td>
                  <td>{tableRow.className}</td>
                  <td>{tableRow.offeringName}</td>
                  <td>{tableRow.artifactName}</td>
                  <td><span className="initials" title={tableRow.creator.fullName}>{tableRow.creator.initials}</span></td>
                  <td>{tableRow.group}</td>
                  <td>{tableRow.groupMembers.map((groupMember) => <span key={groupMember.id} title={groupMember.fullName}>{groupMember.initials}</span>)}</td>
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

    /*
                  <button onClick={() => alert("TODO: implement button action")}>Copy Into Current Document</button>
              <button onClick={() => alert("TODO: implement button action")}>View In Original Document</button>

    */

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
              <div className="learning-log-title">Artifacts Archive</div>
            </div>
            <div className="right-buttons">
              <button type="button" onClick={this.handleHideLearningLogButton}><i className="icon icon-profile" /> Close Artifacts Archive</button>
            </div>
          </div>
        </div>
        <div className="learning-log-workspace">
          {this.renderFilters()}
          {this.renderWorkspace()}
          {this.renderSelectedRow()}
        </div>
      </div>
    )
  }
}

