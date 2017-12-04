const webpack = require("webpack");
const ExtractTextPlugin = require("extract-text-webpack-plugin");
const HtmlWebpackPlugin = require('html-webpack-plugin');

const isDev = process.env.NODE_ENV === "development";
const cssFilename = isDev ? "[name].css" : "[name].[contenthash].css";
const jsFilename = isDev ? "[name].js" : "[name].[chunkhash].js";

const extractSass = new ExtractTextPlugin({
   filename: cssFilename,
   disable: isDev
});

module.exports = [
    {
        entry: {
            app: "./src/app.tsx",
            styles: "./src/styles/app.scss",
            globals: ["react", "react-dom", "firebase"]
        },

        output: {
            filename: jsFilename,
            path: __dirname + "/dist/assets"
        },

        // Enable sourcemaps for debugging webpack's output.
        devtool: isDev ? "source-map" : "",

        resolve: {
            // Add '.ts' and '.tsx' as resolvable extensions.
            extensions: [".webpack.js", ".web.js", ".ts", ".tsx", ".js"]
        },

        module: {
            rules: [
                // All output '.js' files will have any sourcemaps re-processed by 'source-map-loader'.
                { enforce: "pre", test: /\.js$/, loader: "source-map-loader" },

                // All files with a '.ts' or '.tsx' extension will be handled by 'awesome-typescript-loader'.
                { test: /\.tsx?$/, loader: "awesome-typescript-loader" },

                {
                    test: /\.scss$/,
                    use: extractSass.extract({
                        use: [
                            {loader: "css-loader", options: { sourceMap: isDev }},
                            {loader: "sass-loader", options: { sourceMap: isDev }}
                        ],
                        fallback: 'style-loader'
                    })
                }
            ]
        },

        plugins: [
            extractSass,
            new webpack.optimize.CommonsChunkPlugin({
                name: "globals",
                filename: jsFilename
            }),
            new HtmlWebpackPlugin({
                filename: '../index.html',
                template: 'src/index.template.html'
            })
        ]
    },
    {
        entry: {
            "drawing-tool": "./src/drawing-tool.tsx",
            "drawing-tool-globals": ["firebase"]
        },

        output: {
            filename: jsFilename,
            path: __dirname + "/dist/assets"
        },

        // Enable sourcemaps for debugging webpack's output.
        devtool: isDev ? "source-map" : "",

        resolve: {
            // Add '.ts' and '.tsx' as resolvable extensions.
            extensions: [".webpack.js", ".web.js", ".ts", ".tsx", ".js"]
        },

        module: {
            rules: [
                // All output '.js' files will have any sourcemaps re-processed by 'source-map-loader'.
                { enforce: "pre", test: /\.js$/, loader: "source-map-loader" },

                // All files with a '.ts' or '.tsx' extension will be handled by 'awesome-typescript-loader'.
                { test: /\.tsx?$/, loader: "awesome-typescript-loader" }
            ]
        },

        plugins: [
            extractSass,
            new webpack.optimize.CommonsChunkPlugin({
                name: "drawing-tool-globals",
                filename: jsFilename
            }),
            new HtmlWebpackPlugin({
                filename: '../drawing-tool.html',
                template: 'src/drawing-tool.template.html'
            })
        ]
    }
];
