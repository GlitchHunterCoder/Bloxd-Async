# Introduction
this will outline how to use this tool and what each part of the tool does
# Structured Doc
---
> [!NOTE]
> Front End Section
> this is made for user code, use this for your code
## GeneratorFunction / Generator
these allow access to the hidden global objects, `GeneratorFunction` and `Generator`
## ErrMsg
this is a helper function to display better errors, by displaying the errors
- name
- message
- and stack

This is used in `Try`
## Try
```js
/**
 * Runs code, and on throw, displays better errors
 * @param {Func} Function to run
 * @param {...Params} Parameters to give to functions
 * @returns {void}
 */
Try(Func, ...Params)
```
takes in 1 function and any number of params
a shorthand for a try catch using ErrMsg, is used to easily see errors
## TS
### Init
`init(task, ...params) { ... }`
this takes in
## PM
## tick
---
> [!WARNING]
> Back End Section
> Do not edit this section, unless you know what you are doing
## TaskScheduler
## PackageManager
