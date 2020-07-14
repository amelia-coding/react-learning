1. React.render() => 
2. legacyRenderSubtreeIntoContainer 进行fiberRoot的创建
3. 标识_reactRootContainer
4. 第一次渲染时legacyCreateRootFromDOMContainer 来创建
5. fiberRoot = root._internalRoot 下的每一个节点都有一个FiberNode 

什么是fiberRoot？

6. updateContainer => updateContainerAtExpirationTime => scheduleRootUpdate  => createUpdate

什么是ExpirationTime？
fiberRoot 的每一个FiberNode节点都有一个过期时间， 按照过期时间来排一个队列，  过期时间早的先执行，过期时间短的后执行

7 ExpirationTime => computeExpirationForFiber  =>  获取优先级，根据不同的优先级得到不同的过期时间