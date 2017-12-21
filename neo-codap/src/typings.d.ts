// cf. https://hackernoon.com/import-json-into-typescript-8d465beded79
// cf. https://stackoverflow.com/a/43833423
declare module "*.json" {
  const value: any;
  export default value;
}
declare module "html2canvas";
declare module "react-sizeme";
