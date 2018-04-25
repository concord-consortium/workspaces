const webpack = require("webpack");
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const isDev = process.env.NODE_ENV === "development";
const cssFilename = isDev ? "[name].css" : "[name].[contenthash].css";
const jsFilename = isDev ? "[name].js" : "[name].[chunkhash].js";

const distPath = __dirname + "/../dist/prompts";

const globalsList = ["react", "react-dom"];

module.exports = [
    {
        entry: {
            app: "./src/prompts.tsx",
            //vendor: ["react", "react-dom"]
        },

        output: {
            filename: jsFilename,
            path: distPath + "/assets"
        },

        devtool: isDev ? "source-map" : "",

        resolve: {
            extensions: [".webpack.js", ".web.js", ".ts", ".tsx", ".js"]
        },

        module: {
            rules: [
                { enforce: "pre", test: /\.js$/, loader: "source-map-loader" },
                { test: /\.tsx?$/, loader: "ts-loader" },
                { test: /\.scss$/i, loaders: ['style-loader', 'css-loader', 'sass-loader']},
                { test: /\.css$/, loaders: ['style-loader', 'css-loader']}
            ]
        },

        plugins: [
            //new webpack.optimize.CommonsChunkPlugin({
            //    name: "vendor",
            //   filename: jsFilename
            //}),
            new HtmlWebpackPlugin({
                filename: '../index.html',
                template: 'src/index.template.html'
            })
        ]
    }
];
