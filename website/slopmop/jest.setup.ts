import '@testing-library/jest-dom'

// Mock IntersectionObserver which is not available in Jest/Node environment
global.IntersectionObserver = class IntersectionObserver {
  private callback: IntersectionObserverCallback
  private elements: Set<Element> = new Set()

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
  }

  disconnect() {
    this.elements.clear()
  }

  observe(element: Element) {
    this.elements.add(element)
    // Call the callback immediately with isIntersecting=true to simulate the element being visible
    this.callback(
      [
        {
          target: element,
          isIntersecting: true,
          intersectionRatio: 1,
          boundingClientRect: element.getBoundingClientRect(),
          intersectionRect: element.getBoundingClientRect(),
          rootBounds: null,
          time: Date.now(),
        } as IntersectionObserverEntry,
      ],
      this as any
    )
  }

  takeRecords() {
    return []
  }

  unobserve(element: Element) {
    this.elements.delete(element)
  }
} as any

