// P1 复现测试：并发切歌代次令牌
import 'package:flutter_test/flutter_test.dart';
import 'package:cheng_sheng_music/play_token.dart';

void main() {
  test('旧代次被新代次取代后失效', () {
    final t = PlayToken();
    final first = t.next();
    expect(t.isCurrent(first), true);

    final second = t.next();
    expect(t.isCurrent(first), false);
    expect(t.isCurrent(second), true);
  });

  test('多次递增只认最后一个', () {
    final t = PlayToken();
    final tokens = List.generate(5, (_) => t.next());
    for (var i = 0; i < tokens.length - 1; i++) {
      expect(t.isCurrent(tokens[i]), false);
    }
    expect(t.isCurrent(tokens.last), true);
  });
}
