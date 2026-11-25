/// 切歌代次令牌：防止自动/手动并发切歌时旧请求覆盖新请求。
class PlayToken {
  int _value = 0;

  int next() => ++_value;

  bool isCurrent(int token) => token == _value;
}
