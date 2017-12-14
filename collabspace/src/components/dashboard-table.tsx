import * as React from "react"
import * as firebase from "firebase"
import { PortalOffering, PortalUser, AuthQueryParams, PortalTokens } from "../lib/auth"
import { getClassOfferingsRef, getPublicationsRef } from "../lib/refs"
import { FirebaseOfferingMap, FirebasePublicationMap, FirebasePublication } from "../lib/document"
import { UserLookup } from "../lib/user-lookup"
import * as queryString from "query-string"

const timeago = require("timeago.js")
const timeagoInstance = timeago()

export interface DashboardTableRowDocument {
  id: string
  name: string
  url: string
}

export interface DashboardTableRow {
  id: string
  document: DashboardTableRowDocument
  student: string
  group: number
  groupMembers: string
  published: string
  publishedAt: number
}

export interface DashboardTableOfferingNamesMap {
  [key: number]: string
}

export interface DashboardTableComponentProps {
  firebaseUser: firebase.User
  portalUser: PortalUser
  portalOffering: PortalOffering
  portalTokens: PortalTokens
}

export interface DashboardTableComponentState {
  offerings: FirebaseOfferingMap|null
  publications:FirebasePublicationMap|null
  loadedOfferings: boolean
  loadedPublications: boolean
  createdRows: boolean
  rows: DashboardTableRow[]
}

export class DashboardTableComponent extends React.Component<DashboardTableComponentProps, DashboardTableComponentState> {
  offeringsRef: firebase.database.Reference
  publicationsRef: firebase.database.Reference
  userLookup: UserLookup

  constructor (props:DashboardTableComponentProps) {
    super(props);
    this.state = {
      offerings: null,
      publications: null,
      loadedOfferings: false,
      loadedPublications: false,
      createdRows: false,
      rows: []
    }

    this.userLookup = new UserLookup(this.props.portalOffering.classInfo)
  }

  componentWillMount() {
    const {portalOffering} = this.props

    this.offeringsRef = getClassOfferingsRef(portalOffering)
    this.offeringsRef.on("value", this.handleOfferingsRef)

    this.publicationsRef = getPublicationsRef(portalOffering)
    this.publicationsRef.on("value", this.handlePublicationsRef)
  }

  componentWillUnmount() {
    this.offeringsRef.off("value", this.handleOfferingsRef)
  }

  handleOfferingsRef = (snapshot:firebase.database.DataSnapshot) => {
    const offerings:FirebaseOfferingMap|null = snapshot.val()
    this.setState({offerings, loadedOfferings: true},  () => this.createRows())
  }

  handlePublicationsRef = (snapshot:firebase.database.DataSnapshot) => {
    const publications:FirebasePublicationMap|null = snapshot.val()
    this.setState({publications, loadedPublications: true}, () => this.createRows())
  }

  createRows() {
    if (!this.state.loadedOfferings || !this.state.loadedPublications) {
      return
    }
    let rows:DashboardTableRow[] = []

    const {offerings, publications} = this.state

    const offeringNames:DashboardTableOfferingNamesMap = {}
    if (offerings) {
      Object.keys(offerings).forEach((offeringId) => {
        const id = parseInt(offeringId)
        offeringNames[id] = offerings[id].name
      })
    }

    if (publications) {
      rows = Object.keys(publications).map<DashboardTableRow>((publicationId) => {
        const publication:FirebasePublication = publications[publicationId]
        const student = this.userLookup.lookup(publication.creator)
        const groupMembers = Object.keys(publication.groupMembers).map((id) => {
          const member = this.userLookup.lookup(id)
          return member ? member.fullName : "Unknown Student"
        }).join(", ")
        const params:AuthQueryParams = {
          jwtToken: this.props.portalTokens.rawPortalJWT,
          publication: publicationId,
          offeringId: publication.offeringId,
          classInfoUrl: this.props.portalOffering.classInfo.uri
        }
        const row:DashboardTableRow = {
          id: publicationId,
          document: {
            id: publication.documentId,
            name: offeringNames[publication.offeringId],
            url: queryString.stringify(params)
          },
          student: student ? student.fullName : "Unknown Student",
          group: publication.group,
          groupMembers: groupMembers,
          published: timeagoInstance.format(publication.createdAt),
          publishedAt: publication.createdAt as number
        }
        return row
      })

      rows.sort((a, b) => b.publishedAt - a.publishedAt)
    }

    this.setState({createdRows: true, rows})
  }

  renderHeader() {
    const {firebaseUser, portalUser, portalOffering} = this.props
    const {classInfo} = portalOffering
    const userName = portalUser ? portalUser.fullName : (firebaseUser.isAnonymous ? "Anonymous User" : firebaseUser.displayName)
    return (
      <div className="header">
        <div className="document-info">
          <div className="document-name">
            {classInfo.name}
          </div>
          <div className="instance-info" >Dashboard</div>
        </div>
        <div className="user-info">
          <div className="user-name" title={firebaseUser.uid}>{userName}</div>
        </div>
      </div>
    )
  }

  renderTable() {
    if (this.state.rows.length === 0) {
      return (
        <div className="dashboard-table">
          <div className="no-rows">No publications have been created yet for this class</div>
        </div>
      )
    }

    return (
      <div className="dashboard-table">
        <table>
          <thead>
            <tr>
              <th>Document</th>
              <th>Student</th>
              <th>Group</th>
              <th>Group Members</th>
              <th>Published</th>
            </tr>
          </thead>
          <tbody>
            {this.state.rows.map((row) => {
              const href = `?${row.document.url}`
              const link = (label:string|number) => <a href={href} className="clickable" target="_blank">{label}</a>
              return (
                <tr className="data-row" key={row.id}>
                  <td>{link(row.document.name)}</td>
                  <td>{link(row.student)}</td>
                  <td>{link(row.group)}</td>
                  <td>{link(row.groupMembers)}</td>
                  <td>{link(row.published)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  renderProgress(progress:string) {
    return <div className="progress">{progress}</div>
  }

  render() {
    if (!this.state.createdRows) {
      return this.renderProgress("Loading dashboard data...")
    }

    return (
      <div className="dashboard">
        {this.renderHeader()}
        {this.renderTable()}
      </div>
    )
  }
}

