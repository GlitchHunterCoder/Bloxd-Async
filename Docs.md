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
```js
/**
 * Broadcasts better errors
 * @param {Err} Function to run
 * @returns {void}
 */
ErrMsg(Err)
```
## Try
```js
/**
 * Runs code, and on throw, displays better errors
 * @param {Func(){}} Function to run
 * @param {...Params} Parameters to give to functions
 * @returns {void}
 */
Try(Func, ...Params)
```
## TS
### Init
```js
/**
 * Converts Task to generators
 * @param {Task} task to run
 * @param {...Params} Parameters to give to task
 * @returns {void}
 */
init(Task, ...Params)
```
### \*Run
```js
/**
 * Runs one step of generator
 * @param {Fn(){}} function to run
 * @param {...Params} Parameters to give to task
 * @returns {void}
 */
*run(fn, ...params)
```
### Add
```js
/**
 * Runs one step of generator
 * @param {Fn(){}} Generator to Add
 * @param {Priority} Priority of task, if unset, defaults to 0, higher priority means it will run before other tasks of a lower priority
 * @returns {void}
 */
add(Fn, Priority)
```
## PM
## tick
---
> [!WARNING]
> Back End Section
> Do not edit this section, unless you know what you are doing
## TaskScheduler
## PackageManager
