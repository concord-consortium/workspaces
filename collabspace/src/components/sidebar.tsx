import * as React from "react"
import * as firebase from "firebase"
import { Window } from "../lib/window"
import { WindowManager } from "../lib/window-manager"
import { PortalInfo, PortalOffering, PortalUser, getPortalJWTWithBearerToken, PortalTokens } from "../lib/auth"
import { getPublicationsRef, getArtifactsRef, getFavoritesRef } from "../lib/refs"
import { FirebasePublication, FirebasePublicationWindow, FirebaseArtifact } from "../lib/document"
import { WorkspaceClientThumbnailWidth } from "../../../shared/workspace-client"
import escapeFirebaseKey from "../lib/escape-firebase-key"
import * as queryString from "query-string"
import { UserLookup } from "../lib/user-lookup"
import { MAX_GROUPS } from "./app"
import { LiveTimeAgoComponent } from "./live-time-ago"
import { PublicationWindowOptions } from "./workspace";

const demoId = queryString.parse(window.location.search).demo

type SidebarFilter = "offering" | "group" | "mine" | "search" | "favorites"

export interface FirebaseFavorites {
  users: FirebaseUserFavoritesMap
}

export interface FirebaseUserFavoritesMap {
  [key: string]: FirebaseUserFavorites
}

export interface FirebaseUserFavorites {
  publications: FirebaseUserFavoritesPublicationMap
}

export interface FirebaseUserFavoritesPublicationMap {
  [key: string]: FirebaseUserFavoritesPublication
}

export interface FirebaseUserFavoritesPublication {
  windows: FirebaseUserFavoritesPublicationWindowMap
}

export interface FirebaseUserFavoritesPublicationWindowMap {
  [key: string]: boolean
}

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
  }

  handleToggleViewArtifact = () => {
    this.props.toggleViewArtifact(this.props.artifact)
  }

  render() {
    const {artifact} = this.props
    const url = artifact.thumbnailUrl || artifact.url
    return (
      <div className="artifact" onClick={this.handleToggleViewArtifact}>
        <img src={url} title={artifact.title} style={{width: WorkspaceClientThumbnailWidth}} draggable={false} />
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
  portalOffering: PortalOffering
  windowManager: WindowManager
  creatorName: string
  favorites: FirebaseUserFavoritesPublicationMap
  toggleFavorite: (options: PublicationWindowOptions) => void
  filter: SidebarFilter
  copyIntoDocument: (options: PublicationWindowOptions, title: string) => void
  copyIntoPoster: (options: PublicationWindowOptions, title: string) => void
  group: string
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
    this.artifactsRef = getPublicationsRef(this.props.portalOffering, this.props.publicationId).child("windows").child(this.props.windowId).child("artifacts")
  }

  componentWillMount() {
    this.artifactsRef.on("child_added", this.handleArtifactAdded)
  }

  componentWillUnmount() {
    this.artifactsRef.off("child_added", this.handleArtifactAdded)
  }

  handleArtifactAdded = (snapshot:firebase.database.DataSnapshot) => {
    // we have to listen for added artifacts as the user might click on the published item
    // before the artifact is created and we only listen for publication child_added not value
    const artifact:FirebaseArtifact = snapshot.val()
    const {artifactItems} = this.state
    artifactItems.push({id: snapshot.key as string, artifact})
    this.setState({artifactItems})
  }

  handleCopyIntoDocument = () => {
    const {publicationId, windowId, publication} = this.props
    const title = `${this.props.window.title} (by ${this.props.creatorName} in group ${this.props.publication.group})`
    this.props.copyIntoDocument({
      type: "offering",
      offering: this.props.portalOffering,
      publicationId,
      windowId,
      documentId: publication.documentId
    }, title)
  }

  handleCopyIntoPoster = () => {
    const {publicationId, windowId, publication} = this.props
    const title = `${this.props.window.title} (by ${this.props.creatorName} in group ${this.props.publication.group})`
    this.props.copyIntoPoster({
      type: "offering",
      offering: this.props.portalOffering,
      publicationId,
      windowId,
      documentId: publication.documentId
    }, title)
  }

  handleToggleFavorite = () => {
    const {publicationId, windowId, publication} = this.props
    this.props.toggleFavorite({
      type: "offering",
      offering: this.props.portalOffering,
      publicationId,
      windowId,
      documentId: publication.documentId
    })
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

  renderFavoriteStar(favorited:boolean) {
    const className = favorited ? "icon icon-star-full favorite-star" : "icon icon-star-empty"
    return <i className={className} onClick={this.handleToggleFavorite} />
  }

  render() {
    const {favorites, group} = this.props
    const favorited = favorites[this.props.publicationId] && favorites[this.props.publicationId].windows[this.props.windowId]
    if ((this.props.filter === "favorites") && !favorited) {
      return null
    }

    return (
      <div className="window">
        <div className="window-title">{this.renderFavoriteStar(favorited)} {this.props.window.title}</div>
        {this.renderArtifacts()}
        <div className="window-actions">
          <div onClick={this.handleCopyIntoDocument} className="clickable">Copy Into Your Document</div>
          {group !== "poster" ? <div onClick={this.handleCopyIntoPoster} className="clickable">Copy Into Poster View</div> : null}
        </div>
      </div>
    )
  }
}

export interface SidebarPublicationComponentProps {
  publicationItem: FirebasePublicationItem
  userLookup: UserLookup
  toggleViewArtifact: (artifact: FirebaseArtifact) => void
  portalOffering: PortalOffering
  portalTokens: PortalTokens
  windowManager: WindowManager
  expandAll: boolean
  favorites: FirebaseUserFavoritesPublicationMap
  toggleFavorite: (options: PublicationWindowOptions) => void
  filter: SidebarFilter
  copyIntoDocument: (options: PublicationWindowOptions, title: string) => void
  copyIntoPoster: (options: PublicationWindowOptions, title: string) => void
  group: string
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
      expanded: this.props.expandAll,
      creatorName: this.getUserName(this.props.publicationItem.publication.creator)
    }
  }

  componentWillReceiveProps(nextProps: SidebarPublicationComponentProps) {
    if (nextProps.expandAll !== this.props.expandAll) {
      this.setState({expanded: nextProps.expandAll})
    }
  }

  handleToggle = () => {
    this.setState({expanded: !this.state.expanded})
  }

  getUserName(id:string) {
    const user = this.props.userLookup.lookup(id)
    return user ? user.fullName : "Unknown Student"
  }

  renderWindows() {
    const {publicationItem} = this.props
    const {publication} = publicationItem
    const windowIds = Object.keys(publication.windows)
    const windows:JSX.Element[] = []

    if (windowIds.length === 0) {
      return null
    }

    windowIds.forEach((windowId) => {
      const window = publication.windows[windowId]
      if (!window.ownerId) {
        windows.push(
          <SidebarPublicationWindowComponent
            key={windowId}
            publicationId={publicationItem.id}
            publication={publication}
            windowId={windowId}
            window={window}
            creatorName={this.state.creatorName}
            toggleViewArtifact={this.props.toggleViewArtifact}
            portalOffering={this.props.portalOffering}
            windowManager={this.props.windowManager}
            favorites={this.props.favorites}
            toggleFavorite={this.props.toggleFavorite}
            filter={this.props.filter}
            copyIntoDocument={this.props.copyIntoDocument}
            copyIntoPoster={this.props.copyIntoPoster}
            group={this.props.group}
          />
        )
      }
    })

    return (
      <div className="windows">
        {windows}
      </div>
    )
  }

  renderGroupUsers() {
    const {publication} = this.props.publicationItem
    const groupUsers:string[] = []
    const escapedCreatorId = escapeFirebaseKey(publication.creator)
    Object.keys(publication.groupMembers).forEach((id) => {
      if (id !== escapedCreatorId) {
        groupUsers.push(this.getUserName(id))
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
    const {publicationItem, portalTokens} = this.props
    const {publication} = publicationItem
    const params:any = {
      portalJWT: portalTokens.rawPortalJWT,
      domain: portalTokens.domain,
      document: publication.documentId,
      publication: publicationItem.id
    }
    if (portalTokens.portalJWT.user_type === "teacher") {
      params.classInfoUrl = this.props.portalOffering.classInfoUrl
      params.offeringId = this.props.portalOffering.id
    }
    if (demoId) {
      params.demo = demoId
    }
    const {location} = window
    const url = `${location.origin}${location.pathname.replace("index.html", "")}dashboard.html?${queryString.stringify(params)}`

    return (
      <div className="expanded-info">
        <div className="user-name">{this.state.creatorName}</div>
        {this.renderGroupUsers()}
        <a className="clickable" href={url} target="_blank">Open In Dashboard</a>
        {this.renderWindows()}
      </div>
    )
  }

  render() {
    const {publicationItem, favorites} = this.props
    const {publication, index} = publicationItem
    const {group, createdAt} = publication
    const user = this.props.userLookup.lookup(publication.creator)
    const name = user ? user.fullName : "Unknown Student"
    const initials = user ? user.initials : "?"
    const expanded = this.state.expanded || ((this.props.filter === "favorites") && favorites[publicationItem.id])
    return (
      <div className="publication">
        <div className="publication-header clickable" onClick={this.handleToggle}>
          <span className="initials" title={name}>{initials}</span> in group {group} <span className="ago"><LiveTimeAgoComponent timestamp={createdAt} /></span>
        </div>
        {expanded ? this.renderExpanded() : null}
      </div>
    )
  }
}

export interface SidebarComponentProps {
  portalTokens: PortalTokens
  portalOffering: PortalOffering
  portalUser: PortalUser
  group: string
  toggleViewArtifact: (artifact: FirebaseArtifact) => void
  publishing: boolean
  windowManager: WindowManager
  toggleFavorite: (options: PublicationWindowOptions) => void
  copyIntoDocument: (options: PublicationWindowOptions, title: string) => void
  copyIntoPoster: (options: PublicationWindowOptions, title: string) => void
}
export interface SidebarComponentState {
  publicationItems: FirebasePublicationItem[]
  filter: SidebarFilter
  filterGroup: string
  filterOffering: string
  filterSearch: string
  filterSearchTrimmed: string
  expandAll: boolean
  favorites: FirebaseUserFavoritesPublicationMap
}

export class SidebarComponent extends React.Component<SidebarComponentProps, SidebarComponentState> {
  publicationsRef: firebase.database.Reference
  userLookup: UserLookup
  favoritesRef: firebase.database.Reference

  constructor (props:SidebarComponentProps) {
    super(props)
    this.state = {
      publicationItems: [],
      filter: "offering",
      filterGroup: "all",
      filterOffering: "all",
      filterSearch: "",
      filterSearchTrimmed: "",
      expandAll: false,
      favorites: {}
    }
    const {portalOffering, portalUser} = this.props
    this.publicationsRef = getPublicationsRef(portalOffering)
    this.favoritesRef = getFavoritesRef(portalOffering.domain, portalOffering.classInfo.classHash, portalUser.id).child("publications")

    this.userLookup = new UserLookup(portalOffering.classInfo)
  }

  componentWillMount() {
    this.publicationsRef.on("child_added", this.handlePublicationAdded)
    this.favoritesRef.on("value", this.handleFavoritesRef)
  }

  componentWillUnmount() {
    this.publicationsRef.off("child_added", this.handlePublicationAdded)
    this.favoritesRef.off("value", this.handleFavoritesRef)
  }

  handlePublicationAdded = (snapshot:firebase.database.DataSnapshot) => {
    const {publicationItems} = this.state
    const publication:FirebasePublication = snapshot.val()
    if (publication.offeringId === this.props.portalOffering.id) {
      const publicationItem:FirebasePublicationItem = {
        index: publicationItems.length + 1,
        id: snapshot.key as string,
        publication
      }
      publicationItems.unshift(publicationItem)
      this.setState({publicationItems})
    }
  }

  handleFavoritesRef = (snapshot:firebase.database.DataSnapshot|null) => {
    if (snapshot) {
      const favorites:FirebaseUserFavoritesPublicationMap = snapshot.val() || {}
      this.setState({favorites})
    }
  }

  getFilteredPublicationItems() {
    const {publicationItems, filter, filterGroup, filterOffering, filterSearch, filterSearchTrimmed, favorites} = this.state
    const {portalOffering, portalUser, group} = this.props
    const canonicalSearch = filterSearchTrimmed.toLowerCase()
    return publicationItems.filter((publicationItem) => {
      const {publication} = publicationItem
      switch (filter) {
        case "offering":
          if (filterOffering === "all") {
            return true
          }
          if (filterOffering === "me") {
            return publication.creator === portalUser.id
          }
          return publication.creator === filterOffering
        case "group":
          return (filterGroup === "all") || (publication.group === filterGroup)
        case "mine":
          return publication.creator === portalUser.id
        case "search":
          if (canonicalSearch.length === 0) {
            return false;
          }
          const creatorName = this.userLookup.lookup(publication.creator)
          if (creatorName && (creatorName.fullName.toLowerCase().indexOf(canonicalSearch) !== -1)) {
            return true
          }
          let titleMatched = false
          Object.keys(publication.windows).forEach((windowId) => {
            const publicationWindow = publication.windows[windowId]
            titleMatched = titleMatched || publicationWindow.title.toLowerCase().indexOf(canonicalSearch) !== -1
          })
          return titleMatched
        case "favorites":
          return !!favorites[publicationItem.id]
        default:
          return true
      }
    })
  }

  handleToggleExpandContract = () => {
    this.setState({expandAll: !this.state.expandAll})
  }

  renderExpandContract(publicationItems: FirebasePublicationItem[]) {
    const {filter, expandAll} = this.state
    if ((filter === "favorites") || (publicationItems.length === 0)) {
      return null
    }
    return <div className="sidebar-header-expand" onClick={this.handleToggleExpandContract}>{expandAll ? "▼" : "▲"}</div>
  }

  renderFilterSelector() {
    const className = (filter:string) => {
      return `clickable ${filter === this.state.filter ? "selected-filter" : ""}`
    }
    //<span className={className("mine")} onClick={() => this.setState({filter: "mine"})}>Mine</span>
    return (
      <div className="filter-selector">
        <span className={className("offering")} onClick={() => this.setState({filter: "offering"})}><i className="icon icon-user" title="Users" /></span>
        <span className={className("group")} onClick={() => this.setState({filter: "group"})}><i className="icon icon-users" title="Groups" /></span>
        <span className={className("favorites")} onClick={() => this.setState({filter: "favorites"})}><i className="icon icon-star-full favorite-star" title="Favorites" /></span>
        <span className={className("search")} onClick={() => this.setState({filter: "search"})}><i className="icon icon-search" title="Search" /></span>
      </div>
    )
  }

  handleOfferingFilterChanged = (e:React.ChangeEvent<HTMLSelectElement>) => {
    this.setState({filterOffering: e.target.value})
  }

  handleGroupFilterChanged = (e:React.ChangeEvent<HTMLSelectElement>) => {
    this.setState({filterGroup: e.target.value})
  }

  handleSearchFilterChanged = (e:React.ChangeEvent<HTMLInputElement>) => {
    this.setState({filterSearch: e.target.value, filterSearchTrimmed: e.target.value.trim()})
  }

  renderFilter() {
    let filter:JSX.Element|null = null
    let options:JSX.Element[] = []

    switch (this.state.filter) {
      case "offering":
        options.push(<option value="all" key="all-offering">All Users</option>)
        options.push(<option value="me" key="me-offering">Me</option>)
        this.userLookup.options().forEach((option) => {
          options.push(<option value={option.value} key={option.key}>{option.name}</option>)
        })
        filter = (
          <select onChange={this.handleOfferingFilterChanged} value={this.state.filterOffering}>
            {options}
          </select>
        )
        break
      case "group":
        options.push(<option value="all" key="all-groups">All Groups</option>)
        options.push(<option value={this.props.group} key="me-group">My Group</option>)
        for (let i=1; i <= MAX_GROUPS; i++) {
          options.push(<option value={i} key={i}>Group {i}</option>)
        }
        filter = (
          <select onChange={this.handleGroupFilterChanged} value={this.state.filterGroup}>
            {options}
          </select>
        )
        break
      case "search":
        filter = <input placeholder="Search..." onChange={this.handleSearchFilterChanged} value={this.state.filterSearch} />
        break
    }

    return filter ? <div className="filter">{filter}</div> : null
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

  renderPublications(publicationItems: FirebasePublicationItem[]) {
    if (publicationItems.length === 0) {
      if ((this.state.filter !== "search") || (this.state.filterSearchTrimmed.length > 0)) {
        return <div className="none-found">No publications were found</div>
      }
      return null
    }

    return (
      <div className="publications">
        {publicationItems.map((publicationItem) => {
          return <SidebarPublicationComponent
                   key={publicationItem.id}
                   publicationItem={publicationItem}
                   userLookup={this.userLookup}
                   toggleViewArtifact={this.props.toggleViewArtifact}
                   portalOffering={this.props.portalOffering}
                   portalTokens={this.props.portalTokens}
                   windowManager={this.props.windowManager}
                   expandAll={this.state.expandAll}
                   toggleFavorite={this.props.toggleFavorite}
                   favorites={this.state.favorites}
                   filter={this.state.filter}
                   copyIntoDocument={this.props.copyIntoDocument}
                   copyIntoPoster={this.props.copyIntoPoster}
                   group={this.props.group}
                 />
        })}
      </div>
    )
  }

  render() {
    const publicationItems = this.getFilteredPublicationItems()
    return (
      <div className="sidebar">
        <div className="sidebar-header">
          <i className="icon icon-newspaper" />
          Publications
          {this.renderExpandContract(publicationItems)}
        </div>
        {this.renderFilterSelector()}
        {this.renderFilter()}
        {this.renderPublishing()}
        {this.renderPublications(publicationItems)}
      </div>
    )
  }
}