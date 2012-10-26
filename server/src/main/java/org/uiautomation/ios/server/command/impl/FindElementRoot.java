package org.uiautomation.ios.server.command.impl;

import org.uiautomation.ios.communication.WebDriverLikeRequest;
import org.uiautomation.ios.exceptions.IOSAutomationException;
import org.uiautomation.ios.server.IOSDriver;
import org.uiautomation.ios.server.command.UIAScriptHandler;

public class FindElementRoot extends UIAScriptHandler {

  private static final String jsTemplate =
      "var root = UIAutomation.cache.get('0');" +
      "var result = root.element(:depth,:criteria);" +
      "UIAutomation.createJSONResponse(':sessionId',0,result);";

  public FindElementRoot(IOSDriver driver, WebDriverLikeRequest request) {
    super(driver, request);
    try {
      int depth = request.getPayload().getInt("depth");
      String criteria = request.getPayload().getString("criteria");
      String js =
          jsTemplate.replace(":sessionId", request.getSession())
          .replace(":depth", "" + depth)
          .replace(":criteria", criteria);
      setJS(js);
    } catch (Exception e) {
      throw new IOSAutomationException("error parsing the payload", e);
    }



  }
}