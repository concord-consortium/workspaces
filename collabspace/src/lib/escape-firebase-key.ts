export default (s:string):string => {
  return s.replace(/[.$[\]#\/]/g, "_")
}
