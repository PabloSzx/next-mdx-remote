import './idle-callback-polyfill'
import React, { useEffect, useState, useMemo } from 'react'
import * as MDX from '@mdx-js/react'
import { MDXRemoteSerializeResult } from './types'

// requestIdleCallback types found here: https://github.com/microsoft/TypeScript/issues/21309
type RequestIdleCallbackHandle = any
type RequestIdleCallbackOptions = {
  timeout: number
}
type RequestIdleCallbackDeadline = {
  readonly didTimeout: boolean
  timeRemaining: () => number
}

declare global {
  interface Window {
    requestIdleCallback: (
      callback: (deadline: RequestIdleCallbackDeadline) => void,
      opts?: RequestIdleCallbackOptions
    ) => RequestIdleCallbackHandle
    cancelIdleCallback: (handle: RequestIdleCallbackHandle) => void
  }
}

type MDXRemoteProps = MDXRemoteSerializeResult & {
  /**
   * A object mapping names to React components.
   * The key used will be the name accessible to MDX.
   *
   * For example: `{ ComponentName: Component }` will be accessible in the MDX as `<ComponentName/>`.
   */
  components?: Record<string, React.ReactNode>
  /**
   * Determines whether or not the content should be hydrated asynchronously, or "lazily"
   */
  lazy?: boolean
}

export { MDXRemoteSerializeResult }

/**
 * Renders compiled source from next-mdx-remote/serialize.
 */
export function MDXRemote({
  compiledSource,
  scope,
  components = {},
  lazy,
}: MDXRemoteProps) {
  const [isReadyToRender, setIsReadyToRender] = useState(
    !lazy || typeof window === 'undefined'
  )

  // if we're on the client side, we hydrate the mdx content inside
  // requestIdleCallback, since we can be fairly confident that
  // markdown - embedded components are not a high priority to get
  // to interactive compared to...anything else on the page.
  useEffect(() => {
    if (lazy) {
      const handle = window.requestIdleCallback(() => {
        setIsReadyToRender(true)
      })
      return () => window.cancelIdleCallback(handle)
    }
  }, [])

  const Content = useMemo(() => {
    // if we're ready to render, we can assemble the component tree and let React do its thing
    // first we set up the scope which has to include the mdx custom
    // create element function as well as any components we're using
    const fullScope = Object.assign({ mdx: MDX.mdx }, scope)
    const keys = Object.keys(fullScope)
    const values = Object.values(fullScope)

    // now we eval the source code using a function constructor
    // in order for this to work we need to have React, the mdx createElement,
    // and all our components in scope for the function, which is the case here
    // we pass the names (via keys) in as the function's args, and execute the
    // function with the actual values.
    const hydrateFn = Reflect.construct(
      Function,
      keys.concat(`${compiledSource}; return MDXContent;`)
    )

    return hydrateFn.apply(hydrateFn, values)
  }, [scope, compiledSource])

  if (!isReadyToRender) {
    // If we're not ready to render, return an empty div to preserve SSR'd markup
    return (
      <div dangerouslySetInnerHTML={{ __html: '' }} suppressHydrationWarning />
    )
  }

  // wrapping the content with MDXProvider will allow us to customize the standard
  // markdown components (such as "h1" or "a") with the "components" object
  const content = (
    <MDX.MDXProvider components={components}>
      <Content />
    </MDX.MDXProvider>
  )

  // If lazy = true, we need to render a wrapping div to preserve the same markup structure that was SSR'd
  return lazy ? <div>{content}</div> : content
}
