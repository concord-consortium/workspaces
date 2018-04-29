const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const isDev = process.env.NODE_ENV === 'development';
const cssFilename = isDev ? '[name].css' : '[name].[contenthash].css';
const jsFilename = isDev ? '[name].js' : '[name].[chunkhash].js';

const distPath = __dirname + '/../dist/collabspace';

module.exports = {
    entry: {
        'app':             './src/app.tsx',
        'drawing-tool':    './src/drawing-tool.tsx',
        'drawing-tool-v2': './src/drawing-tool-v2.tsx',
        'dashboard':       './src/dashboard.tsx',
        'neo-codap':       './src/neo-codap.tsx',
    },

    output: {
        filename: jsFilename,
        path: distPath + '/assets',
        publicPath: 'assets/'
    },

    devtool: isDev ? 'source-map' : '',

    resolve: {
        extensions: ['.webpack.js', '.web.js', '.ts', '.tsx', '.js']
    },

    module: {
        rules: [
            { enforce: 'pre', test: /\.js$/, loader: 'source-map-loader' },
            { test: /\.tsx?$/, loader: 'ts-loader' },
            { test: /\.scss$/i, loaders: ['style-loader', 'css-loader', 'sass-loader']},
            { test: /\.css$/, loaders: ['style-loader', 'css-loader']},
            { test: /\.(png|woff|woff2|eot|ttf|svg)$/, loader: 'url-loader' }
        ]
    },

    plugins: [
        new HtmlWebpackPlugin({
            filename: '../index.html',
            template: 'src/index.template.html',
            chunks: ['app']
        }),
        new HtmlWebpackPlugin({
            filename: '../drawing-tool.html',
            template: 'src/drawing-tool.template.html',
            chunks: ['drawing-tool']
        }),
        new HtmlWebpackPlugin({
            filename: '../drawing-tool-v2.html',
            template: 'src/drawing-tool-v2.template.html',
            chunks: ['drawing-tool-v2']
        }),
        new HtmlWebpackPlugin({
            filename: '../dashboard.html',
            template: 'src/dashboard.template.html',
            chunks: ['dashboard']
        }),
        new HtmlWebpackPlugin({
            filename: '../neo-codap.html',
            template: 'src/neo-codap.template.html',
            chunks: ['neo-codap']
        }),
        new CopyWebpackPlugin([
            {from: 'src/public', to: distPath}
        ])
    ]
};
