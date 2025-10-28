/**
 * Observer Design Pattern
 *
 * Intent: Lets you define a subscription mechanism to notify multiple objects
 * about any events that happen to the object they're observing.
 *
 * Note that there's a lot of different terms with similar meaning associated
 * with this pattern. Just remember that the Subject is also called the
 * Publisher and the Observer is often called the Subscriber and vice versa.
 * Also the verbs "observe", "listen" or "track" usually mean the same thing.
 */

#pragma once

#include <functional>
#include <list>

template<class T>
class Subject {
  std::list<std::function<void(const T&)>> observers;

public:
  template<class F> void subscribe(F&& callback) {
    observers.push_back(callback);
  }

  void next(const T& value) {
    for(auto& cb : observers) {
      cb(value);
    }
  }
};
