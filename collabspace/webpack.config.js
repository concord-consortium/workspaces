const webpack = require("webpack");
const ExtractTextPlugin = require("extract-text-webpack-plugin");
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const isDev = process.env.NODE_ENV === "development";
const cssFilename = isDev ? "[name].css" : "[name].[contenthash].css";
const jsFilename = isDev ? "[name].js" : "[name].[chunkhash].js";

const distPath = __dirname + "/../dist/collabspace";

const globalsList = ["react", "react-dom", "firebase", "lodash",
                    "mobx", "mobx-state-tree", "query-string", "uuid"];

const extractSass = new ExtractTextPlugin({
   filename: cssFilename,
   disable: isDev
});

module.exports = [
    {
        entry: {
            app: "./src/app.tsx",
            styles: "./src/styles/app.scss",
            globals: globalsList
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
            }),
            new CopyWebpackPlugin([
                {from: 'src/public', to: distPath}
            ])
        ]
    },
    {
        entry: {
            "drawing-tool": "./src/drawing-tool.tsx",
            "drawing-tool-globals": globalsList
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

                { test: /\.tsx?$/, loader: "awesome-typescript-loader" }
            ]
        },

        plugins: [
            new webpack.optimize.CommonsChunkPlugin({
                name: "drawing-tool-globals",
                filename: jsFilename
            }),
            new HtmlWebpackPlugin({
                filename: '../drawing-tool.html',
                template: 'src/drawing-tool.template.html'
            })
        ]
    },
    {
        entry: {
            "dashboard": "./src/dashboard.tsx",
            "dashboard-styles": "./src/styles/app.scss",
            "dashboard-globals": globalsList
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
                name: "dashboard-globals",
                filename: jsFilename
            }),
            new HtmlWebpackPlugin({
                filename: '../dashboard.html',
                template: 'src/dashboard.template.html'
            })
        ]
    },
    {
        entry: {
            "neo-codap": "./src/neo-codap.tsx",
            "neo-codap-globals": globalsList
        },

        output: {
            filename: jsFilename,
            path: distPath + "/assets",
            // cf. https://stackoverflow.com/a/45376588
            // cf. https://github.com/webpack/webpack/issues/597#issuecomment-297721105
            publicPath: "assets/"
        },

        devtool: isDev ? "source-map" : "",

        resolve: {
            extensions: [".webpack.js", ".web.js", ".ts", ".tsx", ".js"]
        },

        module: {
            rules: [
                { enforce: "pre", test: /\.js$/, loader: "source-map-loader" },
                { test: /\.tsx?$/, loader: "awesome-typescript-loader" },
                { test: /\.css$/, use: [ 'style-loader', 'css-loader' ] },
                {
                    test: /\.(woff|woff2)$/,
                    use: {
                        loader: 'url-loader',
                        options: {
                        name: 'fonts/[hash].[ext]',
                        limit: 5000,
                        mimetype: 'application/font-woff'
                        }
                    }
                },
                {
                    test: /\.(ttf|eot|svg)$/,
                    use: {
                        loader: 'file-loader',
                        options: {
                        name: 'fonts/[hash].[ext]'
                        }
                    }
                }
            ]
        },

        plugins: [
            new webpack.optimize.CommonsChunkPlugin({
                name: "neo-codap-globals",
                filename: jsFilename
            }),
            new HtmlWebpackPlugin({
                filename: '../neo-codap.html',
                template: 'src/neo-codap.template.html'
            })
        ]
    }
];
